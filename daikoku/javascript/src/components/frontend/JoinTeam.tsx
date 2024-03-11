import { useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';

import { I18nContext, ModalContext } from '../../contexts';
import * as Services from "../../services/index";
import { isError } from '../../types/api';
import { Spinner } from '../utils/Spinner';
import { useQuery } from '@tanstack/react-query';

type state = 'loading' | 'error' | 'ok'

export const JoinTeam = () => {
  const { search } = useLocation();
  const params = useMemo(() => new URLSearchParams(search), [search]);

  const { openJoinTeamModal } = useContext(ModalContext);
  const { translate } = useContext(I18nContext);


  const checkQuery = useQuery({
    queryKey: ['check-token', params.get('token')],
    queryFn: () => Services.validateInvitationToken(params.get('token'))
  })

  // useEffect(() => {
  //   openJoinTeamModal();
  // }, []);

  // useEffect(() => {
  //   console.log({ params })
  //   const token = params.get('token')
  //   if (token) {
  //     Services.validateInvitationToken(token)
  //       .then((res) => {
  //         if (isError(res)) {
  //           toast.error(res.error);
  //         } else {
  //           // setTeam(res.team);
  //           // setNotificationId(res.notificationId);
  //         }
  //       })
  //   } else {
  //     toast.error(translate('team_member.missing_token'))
  //   }
  // }, [params])

  if (checkQuery.isLoading) {
    return <Spinner />
  } else if (checkQuery.data && !isError(checkQuery.data)) {
    return <div>ok</div>
  } else {
    toast.error(checkQuery.data?.error)
  }

  return (
    <Spinner />
  );
};
