import React, { Component } from 'react';
import { Help } from './Help';
import AceEditor from 'react-ace';
import 'brace/mode/html';
import 'brace/mode/json';
import 'brace/mode/javascript';
import 'brace/mode/markdown';
import 'brace/theme/monokai';
import 'brace/ext/searchbox';
import 'brace/ext/language_tools';

import hljs from 'highlight.js';

window.hljs = window.hljs || hljs;

export default class CodeInput extends Component {
  state = {
    value: null,
  };

  onChange = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    try {
      this.setState({ value: null }, () => {
        this.props.onChange(e);
      });
    } catch (ex) {
      this.setState({ value: e });
    }
  };

  render() {
    let code = this.state.value || this.props.value;
    return (
      <div className="form-group row">
        <label htmlFor={`input-${this.props.label}`} className="col-sm-2 control-label">
          {this.props.label} <Help text={this.props.help} />
        </label>
        <div className="col-sm-10">
          <AceEditor
            mode="javascript"
            theme="monokai"
            onChange={this.onChange}
            value={code}
            name="scriptParam"
            editorProps={{ $blockScrolling: true }}
            height="300px"
            width="100%"
            showGutter={true}
            tabSize={2}
            highlightActiveLine={true}
            enableBasicAutocompletion={true}
            enableLiveAutocompletion={true}
          />
        </div>
      </div>
    );
  }
}
