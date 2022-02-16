import React, { useEffect, useRef, useState } from 'react'

export default ({ children, handleDrop }) => {
    const dropRef = useRef()

    const handleDrag = (e) => {
        e.stopPropagation()
        e.preventDefault()
    }

    const handle = (e) => {
        e.preventDefault()
        e.stopPropagation()

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleDrop(e.dataTransfer.files[0])
            e.dataTransfer.clearData()
        }
    }

    useEffect(() => {
        dropRef.current.addEventListener('dragenter', handleDrag)
        dropRef.current.addEventListener('dragleave', handleDrag)
        dropRef.current.addEventListener('dragover', handleDrag)
        dropRef.current.addEventListener('drop', handle)

        return () => {
            dropRef.current?.removeEventListener('dragenter', handleDrag)
            dropRef.current?.removeEventListener('dragleave', handleDrag)
            dropRef.current?.removeEventListener('dragover', handleDrag)
            dropRef.current?.removeEventListener('drop', handle)
        }
    }, [])

    return (
        <div style={{ position: "relative" }} ref={dropRef}>
            {children}
        </div>
    )
}