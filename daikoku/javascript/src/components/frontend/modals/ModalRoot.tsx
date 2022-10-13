import React, { useState, useEffect } from 'react';
import { connect } from 'react-redux';
import ReactModal from 'react-modal';
import ClasseNames from 'classnames';

import * as Modals from './';
import { closeModal } from '../../../core/modal/actions';
import { useDispatch } from 'react-redux';
import { useSelector } from 'react-redux';
import { IState, IStateModal } from '../../../types';

export const ModalRoot = () => {
  const MODAL_TYPES = {
    teamSelector: Modals.TeamSelectorModal,
    assetSelector: Modals.AssetSelectorModal,
    saveOrCancelModal: Modals.SaverOrCancelModal,
    teamCreation: Modals.TeamCreationModal,
    contactModal: Modals.ContactModal,
    subscriptionMetadataModal: Modals.SubscriptionMetadataModal,
    testingApiKey: Modals.TestingApiKeyModal,
    teamInvitation: Modals.TeamInvitationModal,
    joinTeamInvitation: Modals.JoinTeamInvitationModal,
    loginOrRegisterModal: Modals.LoginOrRegisterModal,
    apiKeySelectModal: Modals.ApiKeySelectModal,
    apiSelectModal: Modals.ApiSelectModal,
    apiDocumentationSelectModal: Modals.ApiDocumentationSelectModal,
    formModal: Modals.FormModal,
  };

  const dispatch = useDispatch();
  const {modalType, modalProps, open} = useSelector<IState, IStateModal>(s => s.modal)

  const [modalIsOpen, setModalIsOpen] = useState(open);
  const SpecifiedModal = MODAL_TYPES[modalType];

  useEffect(() => {
    setModalIsOpen(open);
  }, [open]);

  if (!modalType) {
    return null;
  }

  return (
    <div>
      <ReactModal
        isOpen={modalIsOpen}
        onRequestClose={() => dispatch(closeModal())}
        contentLabel="Example Modal"
        ariaHideApp={false}
        overlayClassName={ClasseNames('modal fade in show', { right: modalProps.panelView })}
        bodyOpenClassName="modal-open"
        className="modal-dialog modal-lg"
      >
        {SpecifiedModal ? <SpecifiedModal closeModal={() => dispatch(closeModal())} {...modalProps} /> : null}
      </ReactModal>
    </div>
  );
};