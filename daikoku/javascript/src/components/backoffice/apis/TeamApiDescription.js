import React, { Component, Suspense } from 'react';
import PropTypes from 'prop-types';

const LazySingleMarkdownInput = React.lazy(() => import('../../inputs/SingleMarkdownInput'));

export class TeamApiDescription extends Component {
  render() {
    return (
      <div>
        <Suspense fallback={<div>loading ...</div>}>
          <LazySingleMarkdownInput
            team={this.props.team}
            height={window.innerHeight - 300 + 'px'}
            value={this.props.value.description}
            onChange={(code) => {
              const newValue = this.props.value;
              newValue.description = code;
              this.props.onChange(newValue);
            }}
            fullWidth={true}
          />
        </Suspense>
      </div>
    );
  }
}

TeamApiDescription.propTypes = {
  team: PropTypes.object,
  value: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
};
