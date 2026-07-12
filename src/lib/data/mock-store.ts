import type { Account, Debt, FinanceDocument, DocumentExtraction, Transaction, ImportBatch, ImportRow } from "@/types/domain";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

type MockState = {
  users: Map<string, { email: string; password: string; id: string }>;
  transactions: Transaction[];
  debts: Debt[];
  documents: FinanceDocument[];
  documentExtractions: DocumentExtraction[];
  duplicateCandidates: unknown[];
  importBatches: ImportBatch[];
  importRows: ImportRow[];
  accounts: Account[];
};

const filePath = path.join(process.cwd(), "mock_state.json");

let memoryState: MockState | null = null;
let lastLoadTime = 0;
let saveTimeout: NodeJS.Timeout | null = null;


function flushSave() {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
    try {
      if (memoryState) {
        const toSave = {
          ...memoryState,
          users: Array.from(memoryState.users.entries()),
        };
        fs.writeFileSync(filePath, JSON.stringify(toSave, null, 2), "utf8");
        lastLoadTime = fs.statSync(filePath).mtimeMs;
      }
    } catch (e) {
      // ignore
    }
  }
}

function loadState(): MockState {
  flushSave();
  try {
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      if (!memoryState || stat.mtimeMs > lastLoadTime) {
        const content = fs.readFileSync(filePath, "utf8");
        const parsed = JSON.parse(content);
        const usersMap = new Map();
        if (parsed.users && Array.isArray(parsed.users)) {
          for (const [k, v] of parsed.users) {
            usersMap.set(k, v);
          }
        }
        parsed.users = usersMap;

        if (!memoryState) {
          memoryState = parsed;
        } else {
          // Clear and copy properties to preserve reference integrity of the Proxy wrappers
          const keys = Object.keys(memoryState) as (keyof MockState)[];
          for (const key of keys) {
            delete (memoryState as any)[key];
          }
          Object.assign(memoryState, parsed);
        }

        lastLoadTime = stat.mtimeMs;
      }
    }
  } catch (e) {
    // ignore
  }

  if (!memoryState) {
    memoryState = {
      users: new Map(),
      transactions: [],
      debts: [],
      documents: [],
      documentExtractions: [],
      duplicateCandidates: [],
      importBatches: [],
      importRows: [],
      accounts: [],
    };
  }
  return memoryState;
}

function saveState(state: MockState) {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveTimeout = null;
    try {
      const toSave = {
        ...state,
        users: Array.from(state.users.entries()),
      };
      fs.writeFileSync(filePath, JSON.stringify(toSave, null, 2), "utf8");
      try {
        lastLoadTime = fs.statSync(filePath).mtimeMs;
      } catch (e) {}
    } catch (e) {
      // ignore
    }
  }, 10);
}

const MUTATING_METHODS = new Set([
  "push", "pop", "shift", "unshift", "splice", "reverse", "sort",
  "set", "delete", "clear"
]);

export function getMockState(): MockState {
  const state = loadState();

  const handler = {
    get(target: any, prop: string | symbol, receiver: any): any {
      const val = Reflect.get(target, prop, receiver);
      if (typeof val === "object" && val !== null) {
        return new Proxy(val, {
          set(t, p, v, r) {
            const res = Reflect.set(t, p, v, r);
            saveState(state);
            return res;
          },
          deleteProperty(t, p) {
            const res = Reflect.deleteProperty(t, p);
            saveState(state);
            return res;
          },
          get(t, p, r) {
            const propVal = Reflect.get(t, p, r);
            if (typeof propVal === "function") {
              return (...args: any[]) => {
                const res = propVal.apply(t, args);
                if (typeof p === "string" && MUTATING_METHODS.has(p)) {
                  saveState(state);
                }
                return res;
              };
            }
            return propVal;
          }
        });
      }
      return val;
    },
    set(target: any, prop: string | symbol, value: any, receiver: any): boolean {
      const res = Reflect.set(target, prop, value, receiver);
      saveState(state);
      return res;
    }
  };

  return new Proxy(state, handler);
}

export function mockUserId(email: string) {
  const digest = createHash("sha256").update(email).digest("base64url").slice(0, 24);
  return `mock-${digest}`;
}
