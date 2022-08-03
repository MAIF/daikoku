import React from 'react';
import { CodeInput } from '@maif/react-forms';

import 'brace/theme/idle_fingers';

export default ({
  onChange,
  value,
  setRef,
  onLoad,
  className = '',
  readOnly,
  mode = 'javascript',
  ...props
}: any) => {
  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <CodeInput
      className={className}
      readOnly={readOnly}
      mode={mode}
      // @ts-expect-error TS(2322): Type '{ className: any; readOnly: any; mode: any; ... Remove this comment to see the full error message
      theme="idle_fingers"
      onChange={onChange}
      value={value}
      onLoad={onLoad}
      height={props.height}
      width={props.width}
    />
  );
};
