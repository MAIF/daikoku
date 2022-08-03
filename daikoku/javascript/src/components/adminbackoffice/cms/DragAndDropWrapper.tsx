import React, { useEffect, useRef, useState } from 'react';

export default ({
  children,
  handleDrop
}: any) => {
  const dropRef = useRef();

  const handleDrag = (e: any) => {
    e.stopPropagation();
    e.preventDefault();
  };

  const handle = (e: any) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleDrop(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  };

  useEffect(() => {
    // @ts-expect-error TS(2532): Object is possibly 'undefined'.
    dropRef.current.addEventListener('dragenter', handleDrag);
    // @ts-expect-error TS(2532): Object is possibly 'undefined'.
    dropRef.current.addEventListener('dragleave', handleDrag);
    // @ts-expect-error TS(2532): Object is possibly 'undefined'.
    dropRef.current.addEventListener('dragover', handleDrag);
    // @ts-expect-error TS(2532): Object is possibly 'undefined'.
    dropRef.current.addEventListener('drop', handle);

    return () => {
      (dropRef.current as any)?.removeEventListener('dragenter', handleDrag);
      (dropRef.current as any)?.removeEventListener('dragleave', handleDrag);
      (dropRef.current as any)?.removeEventListener('dragover', handleDrag);
      (dropRef.current as any)?.removeEventListener('drop', handle);
    };
  }, []);

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div style={{ position: 'relative' }} ref={dropRef}>
      {children}
    </div>
  );
};
