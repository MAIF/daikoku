import React, { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';

export const MaybeHomePage = ({
  tenant
}: any) => {
  const connectedUser = useSelector((state) => (state as any).connectedUser);

  const navigate = useNavigate();

  useEffect(() => {
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
