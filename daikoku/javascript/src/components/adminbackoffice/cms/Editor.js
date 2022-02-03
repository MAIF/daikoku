import React from 'react';
import AceEditor from 'react-ace';

import Beautify from 'ace-builds/src-noconflict/ext-beautify'
import 'ace-builds/src-noconflict/mode-html'
import 'ace-builds/src-noconflict/mode-json'
import 'ace-builds/src-noconflict/mode-javascript'
import 'ace-builds/src-noconflict/mode-css'
import 'ace-builds/src-noconflict/mode-plain_text'
import 'ace-builds/src-noconflict/mode-xml'
import 'ace-builds/src-noconflict/mode-markdown'
import 'ace-builds/src-noconflict/theme-monokai'
import 'ace-builds/src-noconflict/theme-tomorrow'
import 'ace-builds/src-noconflict/ext-searchbox'
import 'ace-builds/src-noconflict/ext-language_tools'

export default ({ onChange, value, setRef, className = '', readOnly, theme = 'monokai', mode = 'javascript', ...props }) => {
    return <AceEditor
        commands={Beautify.commands}
        className={className}
        readOnly={readOnly}
        style={{ zIndex: 0, isolation: 'isolate' }}
        mode={mode}
        theme={theme}
        onChange={onChange}
        value={value}
        name="scriptParam"
        editorProps={{ $blockScrolling: true }}
        onLoad={editorInstance => {
            setRef(editorInstance)
            editorInstance.container.style.resize = "both";
            document.addEventListener("mouseup", e => (
                editorInstance.resize()
            ));
        }}
        showGutter={true}
        tabSize={2}
        highlightActiveLine={true}
        enableBasicAutocompletion={true}
        enableLiveAutocompletion={true}
        height={props.height}
        width={props.width}
    />
}
