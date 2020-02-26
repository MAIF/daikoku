import React, { Component } from 'react';
import { PropTypes } from 'prop-types';
import { closeModal, openModal } from '../../core/modal';
import { connect } from 'react-redux';

class ActionWithTeamSelectorComponent extends Component {
  openTeamSelectorModal = () => {
    this.props.openModal(
      {
        open: true,
        allTeamSelector: this.props.withAllTeamSelector,
        title: this.props.title,
        description: this.props.description,
        buttonLabel: this.props.buttonLabel,
        teams: this.props.teams,
        pendingTeams: this.props.pendingTeams,
        acceptedTeams: this.props.authorizedTeams,
        action: teams => this.props.action(teams),
        closeModal: this.props.closeModal,
        allowMultipleDemand: this.props.allowMultipleDemand,
        currentLanguage: this.props.currentLanguage
      },
      'teamSelector'
    );
  };

  render() {
    // console.debug({
    //   1: !this.props.allowMultipleDemand,
    //   2: this.props.teams.length === 1,
    //   3: this.props.pendingTeams.includes(this.props.teams[0]._id),
    //   4: this.props.authorizedTeams.includes(this.props.teams[0]._id)
    // })
    if (
      !this.props.allowMultipleDemand &&
      this.props.teams.length === 1 &&
      (this.props.pendingTeams.includes(this.props.teams[0]._id) ||
        this.props.authorizedTeams.includes(this.props.teams[0]._id))
    ) {
      return null;
    }
    return (
      <>
        {React.cloneElement(this.props.children, { onClick: () => this.openTeamSelectorModal() })}
      </>
    );
  } 
}

ActionWithTeamSelectorComponent.defaultProps = {
  pendingTeams: [],
  authorizedTeams: [],
};

ActionWithTeamSelectorComponent.propTypes = {
  title: PropTypes.string,
  description: PropTypes.string,
  teams: PropTypes.array.isRequired,
  pendingTeams: PropTypes.array,
  authorizedTeams: PropTypes.array,
  action: PropTypes.func.isRequired,
  withAllTeamSelector: PropTypes.bool,
  closeOnSelect: PropTypes.bool,
  buttonLabel: PropTypes.string,
  allowMultipleDemand: PropTypes.bool,
  currentLanguage: PropTypes.string
};

const mapStateToProps = state => ({
  ...state.context
});

const mapDispatchToProps = {
  closeModal: () => closeModal(),
  openModal: (modalProps, modalType) => openModal({ modalProps, modalType }),
};

export const ActionWithTeamSelector = connect(
  mapStateToProps,
  mapDispatchToProps
)(ActionWithTeamSelectorComponent);
