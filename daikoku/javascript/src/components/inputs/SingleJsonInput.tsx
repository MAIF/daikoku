import React from 'react';
import AceEditor from 'react-ace';

export default function SingleJsonInput(props: any) {
  const onChange = (e: any) => {
    props.onChange(e);
  };

  let code = props.value;
  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <AceEditor
      mode="json"
      theme="monokai"
      onChange={onChange}
      value={code}
      name="scriptParam"
      editorProps={{ $blockScrolling: true }}
      height={props.height || '300px'}
      width={props.width || '100%'}
      showGutter={true}
      tabSize={2}
      highlightActiveLine={true}
      enableBasicAutocompletion={true}
      enableLiveAutocompletion={true}
    />
  );
}
