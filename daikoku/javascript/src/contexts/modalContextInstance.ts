import React from "react";

import { TModalContext } from "./modals/types";

const init: TModalContext = {
  alert: () => Promise.resolve(),
  confirm: () => Promise.resolve(true),
  prompt: () => Promise.resolve("toto"),
  openFormModal: () => { console.error("ModalProvider is missing in the tree: openFormModal is a no-op"); },
  openTestingApikeyModal: () => { console.error("ModalProvider is missing in the tree: openTestingApikeyModal is a no-op"); },
  openSubMetadataModal: () => { console.error("ModalProvider is missing in the tree: openSubMetadataModal is a no-op"); },
  openApiDocumentationSelectModal: () => { console.error("ModalProvider is missing in the tree: openApiDocumentationSelectModal is a no-op"); },
  openTeamSelectorModal: () => { console.error("ModalProvider is missing in the tree: openTeamSelectorModal is a no-op"); },
  openInvitationTeamModal: () => { console.error("ModalProvider is missing in the tree: openInvitationTeamModal is a no-op"); },
  openSaveOrCancelModal: () => { console.error("ModalProvider is missing in the tree: openSaveOrCancelModal is a no-op"); },
  openLoginOrRegisterModal: () => { console.error("ModalProvider is missing in the tree: openLoginOrRegisterModal is a no-op"); },
  openJoinTeamModal: () => { console.error("ModalProvider is missing in the tree: openJoinTeamModal is a no-op"); },
  openContactModal: () => { console.error("ModalProvider is missing in the tree: openContactModal is a no-op"); },
  openAssetSelectorModal: () => { console.error("ModalProvider is missing in the tree: openAssetSelectorModal is a no-op"); },
  openApiSelectModal: () => { console.error("ModalProvider is missing in the tree: openApiSelectModal is a no-op"); },
  openApiKeySelectModal: () => { console.error("ModalProvider is missing in the tree: openApiKeySelectModal is a no-op"); },
  openCustomModal: () => { console.error("ModalProvider is missing in the tree: openCustomModal is a no-op"); },
  close: () => { console.error("ModalProvider is missing in the tree: close is a no-op"); },
  openRightPanel: () => { console.error("ModalProvider is missing in the tree: openRightPanel is a no-op"); },
  closeRightPanel: () => { console.error("ModalProvider is missing in the tree: closeRightPanel is a no-op"); },
  rightPanelContent: undefined
}

export const ModalContext = React.createContext<TModalContext>(init);
