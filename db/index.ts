import { neon } from "@neondatabase/serverless";

export type RunResult = {
  meta: {
    changes: number;
    last_row_id: number | null;
  };
};

function toPostgres(statement: string): string {
  let index = 0;
  let converted = statement.replace(/\?/g, () => `$${++index}`);
  const insert = converted.trim().match(/^INSERT\s+INTO\s+(categories|suppliers|products|orders|order_items|stock_movements|audit_logs)\b/i);
  if (insert && !/\bRETURNING\b/i.test(converted)) converted = `${converted} RETURNING id`;
  return converted;
}

export class PreparedStatement {
  private values: unknown[] = [];

  constructor(
    private readonly database: Database,
    readonly statement: string,
  ) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  query() {
    return this.database.query(toPostgres(this.statement), this.values);
  }

  async all<T>() {
    const result = await this.query();
    return { results: result.rows as T[] };
  }

  async first<T>() {
    const result = await this.query();
    return (result.rows[0] as T | undefined) ?? null;
  }

  async run(): Promise<RunResult> {
    const result = await this.query();
    const insertedId = result.rows[0]?.id;
    return {
      meta: {
        changes: result.rowCount,
        last_row_id: insertedId == null ? null : Number(insertedId),
      },
    };
  }
}

export class Database {
  private readonly sql;

  constructor(connectionString: string) {
    this.sql = neon(connectionString, { fullResults: true });
  }

  prepare(statement: string) {
    return new PreparedStatement(this, statement);
  }

  query(statement: string, values: unknown[]) {
    return this.sql.query(statement, values);
  }

  async batch(statements: PreparedStatement[]) {
    if (!statements.length) return [];
    return this.sql.transaction(
      statements.map((statement) => statement.query()),
      { isolationLevel: "Serializable" },
    );
  }
}

let database: Database | null = null;

export function getDatabase(): Database {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured.");
  database ??= new Database(connectionString);
  return database;
}
