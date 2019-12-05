import React, { Component } from 'react';
import AceEditor from 'react-ace';

export default class SingleJsonInput extends Component {
  onChange = e => {
    this.props.onChange(e);
  };

  render() {
    let code = this.props.value;
    return (
      <AceEditor
        mode="json"
        theme="monokai"
        onChange={this.onChange}
        value={code}
        name="scriptParam"
        editorProps={{ $blockScrolling: true }}
        height={this.props.height || '300px'}
        width={this.props.width || '100%'}
        showGutter={true}
        tabSize={2}
        highlightActiveLine={true}
        enableBasicAutocompletion={true}
        enableLiveAutocompletion={true}
      />
    );
  }
}