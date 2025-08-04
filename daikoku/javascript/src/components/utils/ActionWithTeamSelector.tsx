import React, { PropsWithChildren, ReactElement, ReactNode, useContext } from 'react';
import { ModalContext, TeamSelectorModalProps } from '../../contexts';


export const ActionWithTeamSelector = (props: PropsWithChildren<TeamSelectorModalProps>) => {
  const { openTeamSelectorModal } = useContext(ModalContext);

  const openModal = () => {
    if (props.teams.length === 1) {
      props.action([props.teams[0]._id]);
    } else {
      openTeamSelectorModal(props);
    }
  };

  if (!React.isValidElement(props.children)) {
    return null
  } else if (
    !props.allowMultipleDemand && props.teams.length === 1 &&
    ((props.pendingTeams && props.pendingTeams.includes(props.teams[0]._id)) ||
      (props.acceptedTeams && props.acceptedTeams.includes(props.teams[0]._id)))
  ) {
    return null;
  }

  return <>{React.cloneElement(props.children as ReactElement<{ onClick?: () => void }>, { onClick: () => openModal() })}</>;
}