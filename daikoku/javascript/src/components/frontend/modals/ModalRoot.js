import React, { useState, useEffect } from 'react';
import { connect } from 'react-redux';
import ReactModal from 'react-modal';
import ClasseNames from 'classnames';

import * as Modals from './';
import { closeModal } from '../../../core/modal/actions';

const ModalContainer = ({ modalType, modalProps, open, closeModal }) => {
  const MODAL_TYPES = {
    teamSelector: Modals.TeamSelectorModal,
    assetSelector: Modals.AssetSelectorModal,
    wysywygModal: Modals.WysiwygModal,
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
  };
  
  const [modalIsOpen, setModalIsOpen] = useState(open);
  const SpecifiedModal = MODAL_TYPES[modalType];

  console.log(MODAL_TYPES)

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
        onRequestClose={closeModal}
        contentLabel="Example Modal"
        ariaHideApp={false}
        overlayClassName={ClasseNames('modal fade in show', { right: modalProps.panelView })}
        bodyOpenClassName="modal-open"
        className="modal-dialog modal-lg">
        {SpecifiedModal ? <SpecifiedModal closeModal={closeModal} {...modalProps} /> : null}
      </ReactModal>
    </div>
  );
};

const mapStateToProps = (state) => ({
  ...state.modal,
});

const mapDispatchToProps = {
  closeModal: () => closeModal(),
};

export const ModalRoot = connect(mapStateToProps, mapDispatchToProps)(ModalContainer);
