import { TBaseObject } from "@maif/react-forms";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { IWithTesting } from "../types";
import { Alert } from "./modals/Alert";
import { ApiDocumentationSelectModal } from "./modals/ApiDocumentationSelectModal";
import { ApiKeySelectModal, IApiKeySelectModalProps } from "./modals/ApiKeySelectModal";
import { ApiSelectModal, IApiSelectModalProps, IModalProps } from "./modals/ApiSelectModal";
import { AssetSelectorModal } from "./modals/AssetsChooserModal";
import { Confirm } from "./modals/Confirm";
import { ContactModal } from "./modals/ContactModal";
import { CustomModal } from "./modals/CustomModal";
import { FormModal } from "./modals/FormModal";
import { JoinTeamInvitationModal } from "./modals/JoinTeamInvitationModal";
import { LoginOrRegisterModal } from "./modals/LoginOrRegisterModal";
import { Prompt } from "./modals/Prompt";
import { SaveOrCancelModal } from "./modals/SaveOrCancelModal";
import { SubscriptionMetadataModal } from "./modals/SubscriptionMetadataModal";
import { TeamInvitationModal } from "./modals/TeamInvitationModal";
import { TeamSelectorModal } from "./modals/TeamSelectionModal";
import { TestingApiKeyModal } from "./modals/TestingApiKeyModal";
import {
  AlertModalProps,
  ConfirmModalProps,
  IApiDocumentationSelectModalProps,
  IAssetSelectorModalProps,
  IContactModalComponentProps,
  IFormModalProps,
  ILoginOrRegisterModalProps,
  IRightPanelProps,
  ISaverOrCancelModalProps,
  ITeamInvitationModalProps,
  PromptModalProps,
  SubscriptionMetadataModalProps,
  TeamSelectorModalProps,
  TestingApiKeyModalProps,
  TModalContext
} from "./modals/types";


const init: TModalContext = {
  alert: () => Promise.resolve(),
  confirm: () => Promise.resolve(true),
  prompt: () => Promise.resolve("toto"),
  openFormModal: () => { },
  openTestingApikeyModal: () => { },
  openSubMetadataModal: () => { },
  openApiDocumentationSelectModal: () => { },
  openTeamSelectorModal: () => { },
  openInvitationTeamModal: () => { },
  openSaveOrCancelModal: () => { },
  openLoginOrRegisterModal: () => { },
  openJoinTeamModal: () => { },
  openContactModal: () => { },
  openAssetSelectorModal: () => { },
  openApiSelectModal: () => { },
  openApiKeySelectModal: () => { },
  openCustomModal: () => { },
  close: () => { },
  openRightPanel: () => { },
  closeRightPanel: () => { },
  rightPanelContent: undefined

}

export const ModalContext = React.createContext<TModalContext>(init);

export const ModalProvider = ({ children }: { children: React.ReactNode }) => {
  const { open, close, modal, modalContent, openRightPanel, closeRightPanel, rightPanelContent } = useModal();

  const alert = (props: AlertModalProps) => new Promise<void>((success) => {
    open(<Alert
      {...props}
      close={() => {
        close();
        success();
      }}

    />)
  })

  const confirm = (props: ConfirmModalProps) => new Promise<boolean>((resolve) => {
    open(<Confirm
      {...props}
      ok={() => {
        resolve(true);
        close();
      }}
      cancel={() => {
        resolve(false);
        close();
      }}
    />)
  })

  const prompt = (props: PromptModalProps) => new Promise<string | undefined>((success) => {
    open(<Prompt
      {...props}
      ok={(inputValue) => {
        success(inputValue);
        close();
      }}
      cancel={() => {
        success(undefined);
        close();
      }}
    />)
  });

  const openFormModal = <T extends TBaseObject>(props: IFormModalProps<T>) => open(<FormModal
    {...props}
    close={close} />)

  const openTestingApikeyModal = <T extends IWithTesting>(props: TestingApiKeyModalProps<T>) => {
    open(<TestingApiKeyModal {...props} close={close} />)
  }
  const openSubMetadataModal = <T extends IWithTesting>(props: SubscriptionMetadataModalProps<T>) => open(<SubscriptionMetadataModal {...props} close={close} />)
  const openApiDocumentationSelectModal = (props: IApiDocumentationSelectModalProps) => open(<ApiDocumentationSelectModal {...props} close={close} />)
  const openTeamSelectorModal = (props: TeamSelectorModalProps) => open(<TeamSelectorModal {...props} close={close} />)
  const openInvitationTeamModal = (props: ITeamInvitationModalProps) => open(<TeamInvitationModal {...props} close={close} />)
  const openSaveOrCancelModal = (props: ISaverOrCancelModalProps) => open(<SaveOrCancelModal {...props} close={close} />)
  const openLoginOrRegisterModal = (props: ILoginOrRegisterModalProps) => open(<LoginOrRegisterModal {...props} close={close} />)
  const openJoinTeamModal = () => open(<JoinTeamInvitationModal close={close} />)
  const openContactModal = (props: IContactModalComponentProps) => open(<ContactModal {...props} close={close} />)
  const openAssetSelectorModal = (props: IAssetSelectorModalProps) => open(<AssetSelectorModal {...props} close={close} />)
  const openApiSelectModal = (props: IApiSelectModalProps) => open(<ApiSelectModal {...props} close={close} />)
  const openApiKeySelectModal = (props: IApiKeySelectModalProps) => open(<ApiKeySelectModal {...props} close={close} />)
  const openCustomModal = (props: IModalProps) => open(<CustomModal {...props} close={close} />)


  return (
    <ModalContext.Provider value={{
      alert,
      confirm,
      prompt,
      openFormModal,
      openTestingApikeyModal,
      openSubMetadataModal,
      openApiDocumentationSelectModal,
      openTeamSelectorModal,
      openInvitationTeamModal,
      openSaveOrCancelModal,
      openLoginOrRegisterModal,
      openJoinTeamModal,
      openContactModal,
      openAssetSelectorModal,
      openApiSelectModal,
      openApiKeySelectModal,
      openCustomModal,
      close,
      closeRightPanel,
      openRightPanel,
      rightPanelContent
    }}>
      <Modal modal={modal} modalContent={modalContent} />
      {children}
    </ModalContext.Provider>
  );
}

// ######### Helpers ###############

const ModalWrapper = (props: { children: JSX.Element, closeModal: () => void }) => {
  return (
    <div>
      <div className="modal show" tabIndex={-1} role="dialog">
        <div className="modal-backdrop show" onClick={props.closeModal} />
        <div className="modal-dialog modal-lg" style={{ zIndex: 10000 }} role="document">
          {props.children}
        </div>
      </div>
    </div>
  )
}

const Modal = ({ modal, modalContent }) => {

  if (!modal) {
    return null;
  }

  return createPortal(
    modalContent,
    document.getElementById("portal-root")!
  );
};

const useModal = () => {
  const [modal, setModal] = useState(false);
  const [modalContent, setModalContent] = useState<JSX.Element>();
  const [rightPanelContent, setRightPanelContent] = useState<IRightPanelProps>();

  const open = (content: JSX.Element) => {
    setModal(true)
    setModalContent(<ModalWrapper closeModal={close}>{content}</ModalWrapper>)
  };
  const close = () => {
    setModal(false)
    setModalContent(undefined)
  };

  const closeRightPanel = () => {
    setRightPanelContent(undefined)
  }

  const openRightPanel = (p: IRightPanelProps) => {
    setRightPanelContent(p)
  }

  return { modal, modalContent, setModalContent, open, close, closeRightPanel, openRightPanel, rightPanelContent };
}