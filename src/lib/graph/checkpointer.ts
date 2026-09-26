import { MemorySaver, type BaseCheckpointSaver } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { getPool } from "@/lib/db";

interface SaverGlobals {
  intuneSaver?: Promise<BaseCheckpointSaver>;
  intuneTestSaver?: BaseCheckpointSaver | null;
}
const globals = globalThis as SaverGlobals;

/** Durable Postgres checkpoints in dev/prod; tests inject an in-memory saver. */
export function getCheckpointer(): Promise<BaseCheckpointSaver> {
  if (globals.intuneTestSaver) return Promise.resolve(globals.intuneTestSaver);
  if (!globals.intuneSaver) {
    globals.intuneSaver = (async () => {
      const saver = new PostgresSaver(getPool());
      await saver.setup();
      return saver;
    })().catch((err) => {
      globals.intuneSaver = undefined;
      throw err;
    });
  }
  return globals.intuneSaver;
}

export function installMemoryCheckpointer(): MemorySaver {
  const saver = new MemorySaver();
  globals.intuneTestSaver = saver;
  return saver;
}

export async function deleteCheckpoints(threadId: string): Promise<void> {
  const saver = await getCheckpointer();
  await saver.deleteThread(threadId).catch(() => undefined);
}
