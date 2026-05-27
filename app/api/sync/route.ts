import { NextRequest, NextResponse } from 'next/server';
import mysql from 'mysql2/promise';

export async function GET() {
  return NextResponse.json({
    host: process.env.MYSQL_HOST || '',
    port: process.env.MYSQL_PORT || '3306',
    database: process.env.MYSQL_DATABASE || ''
  });
}

export async function POST(req: NextRequest) { 
  try {
    const body = await req.json();
    const { config, action, data } = body;

    const host = config.host || process.env.MYSQL_HOST || '';
    const port = 3306; // Hardcoded to 3306 as requested
    const user = process.env.MYSQL_USER || '';
    const password = process.env.MYSQL_PASSWORD || '';
    const database = config.database || process.env.MYSQL_DATABASE || '';

    if (!host || !database) {
      return NextResponse.json({ error: 'Configurações de host e banco de dados são obrigatórias' }, { status: 400 });
    }

    if (host === 'localhost' || host === '127.0.0.1') {
       return NextResponse.json({ 
         error: 'Conexão falhou: "localhost" não é acessível pelo servidor. Use o IP real do servidor MySQL ou um Host DNS público.' 
       }, { status: 400 });
    }

    // config: { host, port, user, password, database }
    let connection;
    try {
      connection = await mysql.createConnection({
        host,
        port,
        user,
        password,
        database,
        connectTimeout: 20000, // 20 seconds timeout
        ssl: {
          rejectUnauthorized: false // Often needed for cloud MySQL
        }
      });
    } catch (connErr: any) {
      console.error('MySQL Conn Error:', connErr);
      let msg = 'Erro de Conexão MySQL: ';
      if (connErr.code === 'ETIMEDOUT') msg += 'Tempo esgotado (Timeout). Verifique se o IP/Porta estão corretos e se o servidor aceita conexões externas.';
      else if (connErr.code === 'ECONNREFUSED') msg += 'Conexão recusada pelo servidor.';
      else msg += connErr.message;
      
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    if (action === 'create_base') {
      // Helper to ensure columns exist
      const ensureColumn = async (table: string, column: string, definition: string) => {
        const [columns]: any = await connection.query(`SHOW COLUMNS FROM ${table} LIKE '${column}'`);
        if (columns.length === 0) {
          await connection.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
        }
      };

      // Create tables if they don't exist
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS app_inventarios (
          id_app varchar(25) NOT NULL,
          date_update datetime DEFAULT (NOW()) ON UPDATE CURRENT_TIMESTAMP,
          data date DEFAULT (CURDATE()),
          datahora_abertura datetime DEFAULT (NOW()),
          datahora_fechamento datetime DEFAULT NULL,
          obs varchar(255) DEFAULT '',
          status char(1) DEFAULT 'A',
          ativo varchar(1) DEFAULT 'S',
          PRIMARY KEY (id_app)
        )
      `);
      await ensureColumn('app_inventarios', 'datahora_abertura', "datetime DEFAULT (NOW())");
      await ensureColumn('app_inventarios', 'datahora_fechamento', "datetime DEFAULT NULL");
      await ensureColumn('app_inventarios', 'obs', "varchar(255) DEFAULT ''");
      await ensureColumn('app_inventarios', 'status', "char(1) DEFAULT 'A'");
      await ensureColumn('app_inventarios', 'ativo', "varchar(1) DEFAULT 'S'");

      await connection.execute(`
        CREATE TABLE IF NOT EXISTS app_inventarios_produtos (
          id_app varchar(25) NOT NULL,
          date_update datetime DEFAULT (NOW()) ON UPDATE CURRENT_TIMESTAMP,
          inventario_id_app varchar(25) DEFAULT '',
          produto_id_app varchar(25) DEFAULT '',
          produto_referencia varchar(25) DEFAULT '',
          qtdade decimal(15, 3) DEFAULT 0.000,
          PRIMARY KEY (id_app)
        )
      `);
      await ensureColumn('app_inventarios_produtos', 'ativo', "varchar(1) DEFAULT 'S'");

      await connection.execute(`
        CREATE TABLE IF NOT EXISTS app_produtos (
          id_app varchar(25) NOT NULL,
          date_update datetime DEFAULT (NOW()) ON UPDATE CURRENT_TIMESTAMP,
          id_bm_produtosprincipal int DEFAULT 0,
          id_bm int DEFAULT 0,
          referencia varchar(25) DEFAULT '',
          descricao varchar(255) DEFAULT '',
          marca varchar(25) DEFAULT '',
          ativo char(1) DEFAULT 'S',
          PRIMARY KEY (id_app)
        )
      `);
      await ensureColumn('app_produtos', 'id_bm_produtosprincipal', 'int DEFAULT 0');
      await ensureColumn('app_produtos', 'ativo', "char(1) DEFAULT 'S'");
      
      await connection.end();
      return NextResponse.json({ success: true, message: 'Estrutura verificada e atualizada com sucesso' });
    }

    if (action === 'sync') {
      const { localProducts, localInventories, localItems } = data;
      const syncMode = body.syncMode || 'full';

      const formatToMySQL = (isoString: string) => {
        if (!isoString) return null;
        try {
          const date = new Date(isoString);
          if (isNaN(date.getTime())) return null;
          // Format: YYYY-MM-DD HH:MM:SS
          return date.toISOString().slice(0, 19).replace('T', ' ');
        } catch (e) {
          return null;
        }
      };

      if (syncMode === 'products_push_only') {
        await connection.end();
        return NextResponse.json({ success: true, message: 'Modo push desativado (produtos são apenas importados)' });
      }

      const formatDateOnly = (val: string) => {
        if (!val) return null;
        try {
          const date = new Date(val);
          if (isNaN(date.getTime())) return null;
          return date.toISOString().split('T')[0];
        } catch (e) {
          return null;
        }
      };

      const getEpochSec = (val: any): number => {
        if (!val) return 0;
        try {
          const d = new Date(val);
          const t = d.getTime();
          return isNaN(t) ? 0 : Math.floor(t / 1000);
        } catch (e) {
          return 0;
        }
      };

      const mapProductRow = (row: any) => {
        return {
          id_app: row.id_app,
          id_bm: Number(row.id_bm || 0),
          id_bm_produtosprincipal: Number(row.id_bm_produtosprincipal || 0),
          referencia: row.referencia || '',
          descricao: row.descricao || '',
          marca: row.marca || '',
          ativo: row.ativo || 'S',
          date_update: row.date_update instanceof Date ? row.date_update.toISOString() : (row.date_update || new Date().toISOString())
        };
      };

      const mapInventoryRow = (row: any) => ({
        id_app: row.id_app,
        data: row.data instanceof Date ? row.data.toISOString().split('T')[0] : (row.data || new Date().toISOString().split('T')[0]),
        date_update: row.date_update instanceof Date ? row.date_update.toISOString() : (row.date_update || new Date().toISOString()),
        datahora_abertura: row.datahora_abertura instanceof Date ? row.datahora_abertura.toISOString() : (row.datahora_abertura || null),
        datahora_fechamento: row.datahora_fechamento instanceof Date ? row.datahora_fechamento.toISOString() : (row.datahora_fechamento || null),
        obs: row.obs || '',
        status: row.status || 'A',
        ativo: row.ativo || 'S'
      });

      const mapItemRow = (row: any) => ({
        id_app: row.id_app,
        inventario_id_app: row.inventario_id_app || '',
        produto_id_app: row.produto_id_app || '',
        produto_referencia: row.produto_referencia || '',
        qtdade: Number(row.qtdade || 0),
        date_update: row.date_update instanceof Date ? row.date_update.toISOString() : (row.date_update || new Date().toISOString()),
        ativo: row.ativo || 'S'
      });

      // --- Sync Products ---
      let finalProducts: any[] = [];
      if (syncMode !== 'inventories_only') {
        const [dbProductsRaw]: any = await connection.execute('SELECT * FROM app_produtos');
        finalProducts = dbProductsRaw.map(mapProductRow);
      } else {
        finalProducts = localProducts || [];
      }

      // --- Sync Inventories ---
      const [dbInventoriesRaw]: any = await connection.execute('SELECT * FROM app_inventarios');
      const dbInventories = dbInventoriesRaw.map(mapInventoryRow);

      const dbInventoriesMap = new Map<string, any>();
      for (const i of dbInventories) dbInventoriesMap.set(i.id_app, i);

      const localInventoriesMap = new Map<string, any>();
      for (const i of localInventories || []) localInventoriesMap.set(i.id_app, i);

      const allInventoryIds = new Set<string>([
        ...Array.from(localInventoriesMap.keys()),
        ...Array.from(dbInventoriesMap.keys())
      ]);

      const finalInventories: any[] = [];

      for (const id of allInventoryIds) {
        const local = localInventoriesMap.get(id);
        const mysqlRow = dbInventoriesMap.get(id);

        if (local && !mysqlRow) {
          // Send to MySQL (Not found)
          await connection.execute(
            'INSERT INTO app_inventarios (id_app, data, date_update, datahora_abertura, datahora_fechamento, obs, status, ativo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [
              local.id_app,
              formatDateOnly(local.data),
              formatToMySQL(local.date_update),
              formatToMySQL(local.datahora_abertura),
              formatToMySQL(local.datahora_fechamento),
              local.obs || '',
              local.status || 'A',
              local.ativo || 'S'
            ]
          );
          finalInventories.push(local);
        } else if (local && mysqlRow) {
          const localTime = getEpochSec(local.date_update);
          const mysqlTime = getEpochSec(mysqlRow.date_update);
          if (localTime > mysqlTime) {
            // Local is newer -> Update MySQL
            await connection.execute(
              'UPDATE app_inventarios SET data=?, date_update=?, datahora_abertura=?, datahora_fechamento=?, obs=?, status=?, ativo=? WHERE id_app=?',
              [
                formatDateOnly(local.data),
                formatToMySQL(local.date_update),
                formatToMySQL(local.datahora_abertura),
                formatToMySQL(local.datahora_fechamento),
                local.obs || '',
                local.status || 'A',
                local.ativo || 'S',
                local.id_app
              ]
            );
            finalInventories.push(local);
          } else {
            // MySQL is newer or equal -> Keep MySQL
            finalInventories.push(mysqlRow);
          }
        } else if (!local && mysqlRow) {
          // Keep MySQL row
          finalInventories.push(mysqlRow);
        }
      }

      // --- Sync Items ---
      const [dbItemsRaw]: any = await connection.execute('SELECT * FROM app_inventarios_produtos');
      const dbItems = dbItemsRaw.map(mapItemRow);

      const dbItemsMap = new Map<string, any>();
      for (const it of dbItems) dbItemsMap.set(it.id_app, it);

      const localItemsMap = new Map<string, any>();
      for (const it of localItems || []) localItemsMap.set(it.id_app, it);

      const allItemIds = new Set<string>([
        ...Array.from(localItemsMap.keys()),
        ...Array.from(dbItemsMap.keys())
      ]);

      const finalItems: any[] = [];

      for (const id of allItemIds) {
        const local = localItemsMap.get(id);
        const mysqlRow = dbItemsMap.get(id);

        if (local && !mysqlRow) {
          // Send to MySQL (Not found)
          await connection.execute(
            'INSERT INTO app_inventarios_produtos (id_app, inventario_id_app, produto_id_app, produto_referencia, qtdade, date_update, ativo) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [local.id_app, local.inventario_id_app, local.produto_id_app, local.produto_referencia, local.qtdade, formatToMySQL(local.date_update), local.ativo || 'S']
          );
          finalItems.push(local);
        } else if (local && mysqlRow) {
          const localTime = getEpochSec(local.date_update);
          const mysqlTime = getEpochSec(mysqlRow.date_update);

          if (localTime > mysqlTime) {
            // Local is newer -> Update MySQL
            await connection.execute(
              'UPDATE app_inventarios_produtos SET inventario_id_app=?, produto_id_app=?, produto_referencia=?, qtdade=?, date_update=?, ativo=? WHERE id_app=?',
              [local.inventario_id_app, local.produto_id_app, local.produto_referencia, local.qtdade, formatToMySQL(local.date_update), local.ativo || 'S', local.id_app]
            );
            finalItems.push(local);
          } else {
            // MySQL is newer or equal -> Keep MySQL
            finalItems.push(mysqlRow);
          }
        } else if (!local && mysqlRow) {
          // Keep MySQL row
          finalItems.push(mysqlRow);
        }
      }

      await connection.end();
      return NextResponse.json({ 
        success: true, 
        data: {
          products: finalProducts,
          inventories: finalInventories,
          items: finalItems
        } 
      });
    }

    await connection.end();
    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });

  } catch (error: any) {
    console.error('MySQL Sync Error:', error);
    return NextResponse.json({ error: error.message || 'Erro de conexão com MySQL' }, { status: 500 });
  }
}
