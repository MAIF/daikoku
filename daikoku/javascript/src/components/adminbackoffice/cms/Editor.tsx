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
}) => {
  return (
    <CodeInput
      className={className}
      readOnly={readOnly}
      mode={mode}
      theme="idle_fingers"
      onChange={onChange}
      value={value}
      onLoad={onLoad}
      height={props.height}
      width={props.width}
    />
  );
};
