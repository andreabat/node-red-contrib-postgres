import { PostgresDBNode } from './src/nodes/PostgresDBNode';
import { setRED } from './src/lib/red';

interface Red {
  nodes: {
    createNode: (node: any, config: any) => void;
    registerType: (type: string, constructor: any, opts?: any) => void;
    getNode: (id: string) => any;
  };
}

export = function (RED: Red) {
  setRED(RED);
  RED.nodes.registerType('PostgresDBNode', PostgresDBNode, {
    credentials: {
      user: { type: 'text' },
      password: { type: 'password' }
    }
  });
};