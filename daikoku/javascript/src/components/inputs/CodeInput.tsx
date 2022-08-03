import React, { Component } from 'react';
// @ts-expect-error TS(6142): Module './Help' was resolved to '/Users/qaubert/So... Remove this comment to see the full error message
import { Help } from './Help';
import AceEditor from 'react-ace';
import Beautify from 'ace-builds/src-noconflict/ext-beautify';
import 'ace-builds/src-noconflict/mode-html';
import 'ace-builds/src-noconflict/mode-json';
import 'ace-builds/src-noconflict/mode-javascript';
import 'ace-builds/src-noconflict/mode-css';
import 'ace-builds/src-noconflict/mode-markdown';
import 'ace-builds/src-noconflict/theme-monokai';
import 'ace-builds/src-noconflict/theme-tomorrow';
import 'ace-builds/src-noconflict/ext-searchbox';
import 'ace-builds/src-noconflict/ext-language_tools';

import hljs from 'highlight.js';

(window as any).hljs = (window as any).hljs || hljs;

type State = any;

export default class CodeInput extends Component<{}, State> {
  state = {
    value: null,
  };

  onChange = (e: any) => {
    if (e && e.preventDefault) e.preventDefault();
    try {
      this.setState({ value: null }, () => {
        (this.props as any).onChange(e);
      });
    } catch (ex) {
      this.setState({ value: e });
    }
  };

  render() {
    let code = this.state.value || (this.props as any).value;
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    return (<div className="mb-3 row">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <label htmlFor={`input-${(this.props as any).label}`} className="col-sm-2 control-label mb-2">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Help text={(this.props as any).help} label={(this.props as any).label}/>
        </label>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="col-sm-10">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <AceEditor commands={Beautify.commands} mode={(this.props as any).mode || 'javascript'} theme="monokai" onChange={this.onChange} value={code} name="scriptParam" editorProps={{ $blockScrolling: true }} onLoad={(editorInstance) => {
        editorInstance.container.style.resize = 'both';
        // mouseup = css resize end
        document.addEventListener('mouseup', (e) => editorInstance.resize());
    }} height={(this.props as any).height} width={(this.props as any).width} showGutter={true} tabSize={2} highlightActiveLine={true} enableBasicAutocompletion={true} enableLiveAutocompletion={true}/>
        </div>
      </div>);
  }
}
