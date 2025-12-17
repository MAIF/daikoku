import classNames from "classnames";
import { useContext, useEffect } from 'react';
import CheckCircle from 'react-feather/dist/icons/check-circle';
import XOctagon from 'react-feather/dist/icons/x-octagon';

import { useNavigate, useSearchParams } from 'react-router-dom';
import { I18nContext, ModalContext } from '../../contexts';
import { GlobalContext } from "../../contexts/globalContext";

export const Informations = () => {
  const { translate } = useContext(I18nContext);
  const { tenant } = useContext(GlobalContext);
  const { openJoinTeamModal } = useContext(ModalContext);

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const messageId = searchParams.get('message');
  const error = searchParams.get('error');
  const invitationToken = searchParams.get('invitation-token');

  useEffect(() => {
    if (invitationToken) {
      openJoinTeamModal();
    }
  }, [invitationToken]);


  return (
    <main className='flex-grow-1' role="main">
      <section className="">
        <div className="d-flex flex-row justify-content-between align-items-center">
          <div className="d-flex flex-column justify-content-center">
            <h1 className="jumbotron-heading mt-3">
              {tenant.title ?? tenant.name}
            </h1>
            <p>{tenant.description}</p>
          </div>
        </div>
      </section>
      {(!!messageId || error) && <div className="mx-auto information-cartridge">
        <div className="d-flex flex-column align-items-center justify-content-center gap-3">
          {!!messageId && !error && <CheckCircle size='4.5rem' className="color-success"/>}
          {!!error && <XOctagon size='4.5rem' className="color-danger" />}
          {
            !!messageId && (
              <>
                <h2 className="information-title">{translate(`informations.page.${messageId ?? 'unknown'}.title`)}</h2>
                <p className="information-description">{translate(`informations.page.${messageId ?? 'unknown'}.description`)}</p>
              </>
            )}
          {
            !!error && (
              <>
                <h2 className="information-title">{translate(`informations.page.error.title`)}</h2>
                <p className="information-description">{error}</p>
              </>
            )}
        </div>
        <div className="inforamtion-footer d-flex justify-content-end mt-5">
            <div className="btn btn-sm btn-outline-secondary"onClick={() => navigate("/apis")}>
              {translate('informations.page.go.back.button.label')}
            </div>
        </div>
      </div>
      }
    </main>
  )
}