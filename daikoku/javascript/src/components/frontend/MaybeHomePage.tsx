import { useContext, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { I18nContext } from '../../contexts/i18n-context';

import { CurrentUserContext } from '../../contexts/userContext';
import { ITenant } from '../../types';

export const MaybeHomePage = ({
  tenant
}: { tenant: ITenant }) => {
  const { connectedUser } = useContext(CurrentUserContext);
  const { translate } = useContext(I18nContext);

  const navigate = useNavigate();
  const { search } = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(search);
    const created = params.get("userCreated")
    if (params.get("userCreated") === "true") {
      toast.success(translate('user.validated.success'))
    }

    if (!tenant.homePageVisible || connectedUser?._humanReadableId) {
      navigate('/apis');
    } else window.location.replace('/_/');
  }, []);

  return null;

  // return (
  //   <div className="row">
  //     <div
  //       className="tenant-home-page"
  //       dangerouslySetInnerHTML={{ __html: converter.makeHtml(tenant.unloggedHome || '') }}
  //     />
  //   </div>
  // );
};
