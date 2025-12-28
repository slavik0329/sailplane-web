import { useEffect, useState, useRef } from 'react';
import { createHelia } from 'helia';
import { mfs } from '@helia/mfs';
import { unixfs } from '@helia/unixfs';
import { createLibp2p } from 'libp2p';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { webSockets } from '@libp2p/websockets';
import { webRTC } from '@libp2p/webrtc';
import { webTransport } from '@libp2p/webtransport';
import { bootstrap } from '@libp2p/bootstrap';
import { identify } from '@libp2p/identify';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { gossipsub } from '@chainsafe/libp2p-gossipsub';
import { IDBBlockstore } from 'blockstore-idb';
import { IDBDatastore } from 'datastore-idb';

let heliaInstance = null;

// Bootstrap nodes for peer discovery
const bootstrapNodes = [
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa',
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb',
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA3gU1ZjYZcYW3dwt',
];

async function createHeliaNode() {
  // Use IndexedDB for persistent storage in browser
  const blockstore = new IDBBlockstore('sailplane-blocks');
  const datastore = new IDBDatastore('sailplane-data');

  await blockstore.open();
  await datastore.open();

  const libp2p = await createLibp2p({
    datastore,
    transports: [
      webSockets(),
      webRTC(),
      webTransport(),
      circuitRelayTransport(),
    ],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    peerDiscovery: [
      bootstrap({ list: bootstrapNodes }),
    ],
    services: {
      identify: identify(),
      pubsub: gossipsub({ allowPublishToZeroTopicPeers: true }),
    },
  });

  const helia = await createHelia({
    libp2p,
    blockstore,
    datastore,
  });

  return helia;
}

export default function useHelia() {
  const [isHeliaReady, setHeliaReady] = useState(Boolean(heliaInstance));
  const [heliaInitError, setHeliaInitError] = useState(null);
  const heliaRef = useRef(heliaInstance);

  useEffect(() => {
    async function startHelia() {
      if (heliaInstance) {
        console.log('Helia already started');
        heliaRef.current = heliaInstance;
        setHeliaReady(true);
        return;
      }

      try {
        console.time('Helia Started');
        heliaInstance = await createHeliaNode();
        heliaRef.current = heliaInstance;
        console.timeEnd('Helia Started');
        console.log('Helia node ID:', heliaInstance.libp2p.peerId.toString());
        setHeliaReady(true);
      } catch (error) {
        console.error('Helia init error:', error);
        heliaInstance = null;
        heliaRef.current = null;
        setHeliaInitError(error);
      }
    }

    startHelia();

    return () => {
      // Don't stop on unmount - keep running for the app lifetime
    };
  }, []);

  return {
    helia: heliaRef.current,
    isHeliaReady,
    heliaInitError,
  };
}
