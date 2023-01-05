import React, { ReactNode, useContext } from 'react';
import { ModalContext, TeamSelectorModalProps } from '../../contexts';

type TActionWithTeamSelectorComponentProps = TeamSelectorModalProps & {
  children: JSX.Element
};

export const ActionWithTeamSelector = (props: TActionWithTeamSelectorComponentProps) => {
  const { openTeamSelectorModal } = useContext(ModalContext);

  const openModal = () => {
    if (props.teams.length === 1) {
      props.action([props.teams[0]._id]);
    } else {
      openTeamSelectorModal(props);
    }
  };

  if (
    !props.allowMultipleDemand && props.teams.length === 1 &&
    ((props.pendingTeams && props.pendingTeams.includes(props.teams[0]._id)) ||
      (props.acceptedTeams && props.acceptedTeams.includes(props.teams[0]._id)))
  ) {
    return null;
  }

  return <>{React.cloneElement(props.children, { onClick: () => openModal() })}</>;
}