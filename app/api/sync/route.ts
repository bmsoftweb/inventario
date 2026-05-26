import { NextRequest, NextResponse } from 'next/server';
import mysql from 'mysql2/promise';

export async function POST(req: NextRequest) { 
  try {
    const body = await req.json();
    const { config, action, data } = body;

    if (!config.host || !config.database) {
      return NextResponse.json({ error: 'Configurações de host e banco de dados são obrigatórias' }, { status: 400 });
    }

    if (config.host === 'localhost' || config.host === '127.0.0.1') {
       return NextResponse.json({ 
         error: 'Conexão falhou: "localhost" não é acessível pelo servidor. Use o IP real do servidor MySQL ou um Host DNS público.' 
       }, { status: 400 });
    }

    // config: { host, port, user, password, database }
    let connection;
    try {
      connection = await mysql.createConnection({
        host: config.host,
        port: parseInt(config.port || '3306'),
        user: config.user,
        password: config.password,
        database: config.database,
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
          PRIMARY KEY (id_app)
        )
      `);
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
          id_bm int DEFAULT 0,
          referencia varchar(25) DEFAULT '',
          descricao varchar(255) DEFAULT '',
          marca varchar(25) DEFAULT '',
          PRIMARY KEY (id_app)
        )
      `);
      
      await connection.end();
      return NextResponse.json({ success: true, message: 'Estrutura verificada e atualizada com sucesso' });
    }

    if (action === 'sync') {
      const { localProducts, localInventories, localItems } = data;

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

      // Upload local data to MySQL
      for (const p of localProducts) {
        await connection.execute(
          'INSERT INTO app_produtos (id_app, id_bm, referencia, descricao, marca, date_update) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE id_bm=VALUES(id_bm), referencia=VALUES(referencia), descricao=VALUES(descricao), marca=VALUES(marca), date_update=VALUES(date_update)',
          [p.id_app, p.id_bm, p.referencia, p.descricao, p.marca, formatToMySQL(p.date_update)]
        );
      }
      
      for (const i of localInventories) {
        await connection.execute(
          'INSERT INTO app_inventarios (id_app, data, date_update, ativo) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE data=VALUES(data), date_update=VALUES(date_update), ativo=VALUES(ativo)',
          [i.id_app, formatDateOnly(i.data), formatToMySQL(i.date_update), i.ativo || 'S']
        );
      }

      for (const it of localItems) {
        await connection.execute(
          'INSERT INTO app_inventarios_produtos (id_app, inventario_id_app, produto_id_app, produto_referencia, qtdade, date_update, ativo) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE inventario_id_app=VALUES(inventario_id_app), produto_id_app=VALUES(produto_id_app), produto_referencia=VALUES(produto_referencia), qtdade=VALUES(qtdade), date_update=VALUES(date_update), ativo=VALUES(ativo)',
          [it.id_app, it.inventario_id_app, it.produto_id_app, it.produto_referencia, it.qtdade, formatToMySQL(it.date_update), it.ativo || 'S']
        );
      }

      // Re-fetch everything to send back to client
      const [finalProducts]: any = await connection.execute('SELECT * FROM app_produtos');
      const [finalInventories]: any = await connection.execute('SELECT * FROM app_inventarios');
      const [finalItems]: any = await connection.execute('SELECT * FROM app_inventarios_produtos');

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
