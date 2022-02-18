import React from 'react';
import { CodeInput } from '@maif/react-forms/lib/inputs'

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

export default ({ onChange, value, setRef, onLoad, className = '', readOnly, theme = 'monokai', mode = 'javascript', ...props }) => {
    return <CodeInput
        className={className}
        readOnly={readOnly}
        mode={mode}
        theme={theme}
        onChange={onChange}
        value={value}
        onLoad={onLoad}
        height={props.height}
        width={props.width}
    />
}
