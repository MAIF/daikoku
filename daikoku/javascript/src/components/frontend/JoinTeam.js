import { useEffect } from 'react';
import { connect } from 'react-redux';
import { openJoinTeamModal } from '../../core';

const JoinTeamComponent = (props) => {
  useEffect(() => {
    props.openJoinTeamModal({
      currentLanguage: props.currentLanguage,
    });
  }, []);

  return null;
};

const mapStateToProps = (state) => ({
  ...state.context,
});

const mapDispatchToProps = {
  openJoinTeamModal: (modalProps) => openJoinTeamModal(modalProps),
};

export const JoinTeam = connect(mapStateToProps, mapDispatchToProps)(JoinTeamComponent);
