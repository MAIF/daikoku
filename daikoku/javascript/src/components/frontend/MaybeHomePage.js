import React, { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { converter } from '../../services/showdown';

export const MaybeHomePage = ({ tenant }) => {
  const connectedUser = useSelector((state) => state.connectedUser);

  const navigate = useNavigate();

  useEffect(() => {
    if (!tenant.homePageVisible || connectedUser?._humanReadableId) {
      navigate('/apis');
    }
    else
      window.location.replace("/_/")
  }, []);

  return null

  // return (
  //   <div className="row">
  //     <div
  //       className="tenant-home-page"
  //       dangerouslySetInnerHTML={{ __html: converter.makeHtml(tenant.unloggedHome || '') }}
  //     />
  //   </div>
  // );
};
