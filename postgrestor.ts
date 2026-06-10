import { PostgresDBNode } from './src/nodes/PostgresDBNode';
import { PostgresNode } from './src/nodes/PostgresNode';
import { PostgresListenerNode } from './src/nodes/PostgresListenerNode';
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
  RED.nodes.registerType('PostgresNode', PostgresNode);
  RED.nodes.registerType('PostgresListenerNode', PostgresListenerNode);
};