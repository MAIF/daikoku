import React, { Suspense } from 'react';
import PropTypes from 'prop-types';

const LazySingleMarkdownInput = React.lazy(() => import('../../inputs/SingleMarkdownInput'));

export const TeamApiDescription = props => (
  <div>
    <Suspense fallback={<div>loading ...</div>}>
      <LazySingleMarkdownInput
        team={props.team}
        height={window.innerHeight - 300 + 'px'}
        value={props.value.description}
        onChange={(code) => {
          const newValue = props.value;
          newValue.description = code;
          props.onChange(newValue);
        }}
        fullWidth={true}
      />
    </Suspense>
  </div>
);

TeamApiDescription.propTypes = {
  team: PropTypes.object,
  value: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
};
