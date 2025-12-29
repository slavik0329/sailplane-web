import React, { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';
import { LeftPanel } from './LeftPanel';
import { FileBlock } from './FileBlock';
import { useWindowSize } from './hooks/useWindowSize';
import useHelia from './hooks/useHelia';
import { createOrbitDB } from '@orbitdb/core';
import { Sailplane } from './lib/SharedFS';
import { LoadingRightBlock } from './LoadingRightBlock';
import { Settings } from './Settings';
import { Instances } from './Instances';
import useStore from './store/useStore';

function App() {
  const windowSize = useWindowSize();
  const windowWidth = windowSize.width;
  const heliaObj = useHelia();
  const sharedFS = useRef({});
  const sailplaneRef = useRef(null);
  const orbitdbRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [directoryContents, setDirectoryContents] = useState([]);
  const [currentDirectory, setCurrentDirectory] = useState('/r');
  const [lastUpdateTime, setLastUpdateTime] = useState(null);
  const [currentRightPanel, setCurrentRightPanel] = useState('files');

  const instances = useStore((state) => state.instances);
  const instanceIndex = useStore((state) => state.instanceIndex);
  const addInstance = useStore((state) => state.addInstance);
  const setStatus = useStore((state) => state.setStatus);
  const currentInstance = instances[instanceIndex];

  const styles = {
    container: {
      display: 'flex',
      flexDirection: 'row',
      height: '100%',
    },
  };

  const rootLS = async () => {
    if (ready && sharedFS.current && sharedFS.current.fs) {
      try {
        const res = await sharedFS.current.fs.ls(currentDirectory);

        let contents = [];

        for (let lsItem of res) {
          const type = sharedFS.current.fs.content(lsItem);
          const pathSplit = lsItem.split('/');
          const name = pathSplit[pathSplit.length - 1];

          contents.push({
            type,
            name,
            path: lsItem,
          });
        }

        setDirectoryContents(contents);
      } catch (error) {
        console.error('Error listing directory:', error);
        setDirectoryContents([]);
      }
    }
  };

  useEffect(() => {
    rootLS();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, currentDirectory, lastUpdateTime]);

  const connectOrbit = useCallback(
    async (helia, doLS) => {
      setStatus({ message: 'Initializing OrbitDB' });

      // Create OrbitDB instance if not already created
      if (!orbitdbRef.current) {
        orbitdbRef.current = await createOrbitDB({ ipfs: helia });
      }

      const orbitdb = orbitdbRef.current;

      // Create Sailplane instance if not already created
      if (!sailplaneRef.current) {
        sailplaneRef.current = await Sailplane.create(orbitdb, {});
      }

      const sailplane = sailplaneRef.current;
      let address;

      if (instances.length && currentInstance) {
        address = currentInstance.address;
      } else {
        const name = 'main';
        setStatus({ message: 'Creating new drive' });
        address = await sailplane.determineAddress('superdrive', {
          meta: { name },
        });
        addInstance(name, address.toString());
      }

      setStatus({ message: 'Mounting drive' });
      sharedFS.current = await sailplane.mount(address, {});

      sharedFS.current.events.on('updated', () => {
        setLastUpdateTime(Date.now());
      });

      if (doLS) {
        setCurrentDirectory('/r');
        setLastUpdateTime(Date.now());
      } else {
        setReady(true);
      }
      setStatus({});
    },
    [instances, addInstance, setStatus, currentInstance],
  );

  // Connect when Helia is ready
  useEffect(() => {
    if (heliaObj.isHeliaReady && heliaObj.helia && !ready) {
      connectOrbit(heliaObj.helia);
    }
  }, [heliaObj.helia, heliaObj.isHeliaReady, ready, connectOrbit]);

  // Reconnect when instance changes
  useEffect(() => {
    if (heliaObj.isHeliaReady && heliaObj.helia && ready) {
      connectOrbit(heliaObj.helia, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceIndex, ready, instances]);

  const getRightPanel = () => {
    if (currentRightPanel === 'files') {
      return (
        <FileBlock
          sharedFs={sharedFS}
          helia={heliaObj.helia}
          directoryContents={directoryContents}
          setCurrentDirectory={setCurrentDirectory}
          currentDirectory={currentDirectory}
        />
      );
    } else if (currentRightPanel === 'settings') {
      return <Settings />;
    } else if (currentRightPanel === 'instances') {
      return <Instances sailplane={sailplaneRef.current} />;
    }
  };

  return (
    <div style={styles.container}>
      {windowWidth > 600 ? (
        <LeftPanel
          setCurrentRightPanel={setCurrentRightPanel}
          currentRightPanel={currentRightPanel}
        />
      ) : null}

      {ready ? getRightPanel() : <LoadingRightBlock />}
    </div>
  );
}

export default App;
