import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

/** An in-memory SQLite database behind the part of the D1 API the snapshot store uses, with the given migrations applied. */
export function localD1(...migrations: string[]) {
  const database = new DatabaseSync(":memory:");

  for (const migration of migrations)
    database.exec(
      readFileSync(
        new URL(`../../migrations/${migration}`, import.meta.url),
        "utf8",
      ),
    );

  const prepare = (query: string) => {
    let values: unknown[] = [];

    const statement = {
      bind(...next: unknown[]) {
        values = next;

        return statement;
      },
      async first<T>() {
        return (
          (database.prepare(query).get(...(values as [])) as T | undefined) ??
          null
        );
      },
      async run() {
        const result = database.prepare(query).run(...(values as []));

        return { success: true, meta: { changes: Number(result.changes) } };
      },
    };

    return statement;
  };

  return { db: { prepare } as unknown as D1Database, database };
}
