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
        dropRef.current.addEventListener('dragenter', handleDrag);
        dropRef.current.addEventListener('dragleave', handleDrag);
        dropRef.current.addEventListener('dragover', handleDrag);
        dropRef.current.addEventListener('drop', handle);

    return () => {
      (dropRef.current as any)?.removeEventListener('dragenter', handleDrag);
      (dropRef.current as any)?.removeEventListener('dragleave', handleDrag);
      (dropRef.current as any)?.removeEventListener('dragover', handleDrag);
      (dropRef.current as any)?.removeEventListener('drop', handle);
    };
  }, []);

  return (
        <div style={{ position: 'relative' }} ref={dropRef}>
      {children}
    </div>
  );
};
