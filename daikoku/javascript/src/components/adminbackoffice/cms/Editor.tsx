import React from 'react';
import { CodeInput } from '@maif/react-forms';

import 'brace/theme/idle_fingers';

export default ({
  onChange,
  value,
  className = '',
  readOnly,
  mode = 'javascript',
}: any) => {
  return (
    <CodeInput
      className={className}
      readOnly={readOnly}
      mode={mode}
      onChange={onChange}
      value={value}
    />
  );
};
