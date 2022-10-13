import { useEffect } from 'react';
import { connect } from 'react-redux';
import { openJoinTeamModal } from '../../core';

const JoinTeamComponent = (props: any) => {
  useEffect(() => {
    props.openJoinTeamModal({
      currentLanguage: props.currentLanguage,
    });
  }, []);

  return null;
};

const mapStateToProps = (state: any) => ({
  ...state.context
});

const mapDispatchToProps = {
  openJoinTeamModal: (modalProps: any) => openJoinTeamModal(modalProps),
};

export const JoinTeam = connect(mapStateToProps, mapDispatchToProps)(JoinTeamComponent);
