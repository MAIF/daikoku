import { useContext, useEffect } from 'react';
import { ModalContext } from '../../contexts';

export const JoinTeam = () => {
  const { openJoinTeamModal } = useContext(ModalContext);

  useEffect(() => {
    openJoinTeamModal();
  }, []);

  return null;
};
