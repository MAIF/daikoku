import React, { Component } from 'react';
import { connect } from 'react-redux';
import ReactModal from 'react-modal';
import ClasseNames from 'classnames';

import { TeamSelectorModal, AssetSelectorModal, WysiwygModal } from './';

const MODAL_TYPES = {
  teamSelector: TeamSelectorModal,
  assetSelector: AssetSelectorModal,
  wysywygModal: WysiwygModal,
};

class ModalContainer extends Component {
  state = {
    modalIsOpen: false,
  };

  UNSAFE_componentWillReceiveProps(nextProps) {
    if (nextProps !== this.props) {
      this.setState({
        modalIsOpen: nextProps.modalProps.open,
      });
    }
  }

  closeModal = () => {
    this.setState({ modalIsOpen: false });
  };

  render() {
    const { modalType, modalProps } = this.props;

    if (!this.props.modalType) {
      return null;
    }
    const SpecifiedModal = MODAL_TYPES[modalType];

    return (
      <div>
        <ReactModal
          isOpen={this.state.modalIsOpen}
          onRequestClose={this.closeModal}
          contentLabel="Example Modal"
          ariaHideApp={false}
          overlayClassName={ClasseNames('modal fade in show', { right: modalProps.panelView })}
          bodyOpenClassName="modal-open"
          className="modal-dialog modal-lg">
          <SpecifiedModal closeModal={this.closeModal} {...modalProps} />
        </ReactModal>
      </div>
    );
  }
}

const mapStateToProps = state => ({
  ...state.modal,
});

export const ModalRoot = connect(mapStateToProps, null)(ModalContainer);
