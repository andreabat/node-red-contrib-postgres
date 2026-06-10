interface RedNodes {
  createNode: (node: any, config: any) => void;
  registerType: (type: string, constructor: any, opts?: any) => void;
  getNode: (id: string) => any;
}

interface RedRuntime {
  nodes: RedNodes;
}

let runtime: RedRuntime | null = null;

export function setRED(red: RedRuntime): void {
  runtime = red;
}

export function getRED(): RedRuntime {
  if (!runtime) {
    throw new Error('RED runtime not initialized — must call setRED() before node construction');
  }
  return runtime;
}

export function getREDNodes(): RedNodes {
  return getRED().nodes;
}