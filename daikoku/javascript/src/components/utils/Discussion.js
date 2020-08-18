import React, { useState } from 'react';
import { connect } from 'react-redux';
import { MessageCircle, X, Send } from 'react-feather';

const DiscussionComponent = props => {
  const [opened, setOpened] = useState(false);

  if (opened) {
    return (
      <div className="dicussion-component">

        <div className="discussion">
          <div className="discussion-header">
            Discuss with an admin
        </div>
          <div className="discussion-stream">
            <div className="discussion-messages discussion-messages--received">
              <div className="discussion-message">Hello, what is your problem ?</div>
            </div>
            <div className="discussion-messages discussion-messages--send">
              <div className="discussion-message">Hello</div>
              <div className="discussion-message">good product</div>
              <div className="discussion-message">I can't create a new api...</div>
            </div>
          </div>
          <div className="discussion-form">
            <input type="text"/>
            <div className="send-button">
              <Send />
            </div>
          </div>
        </div>
        
        <button
          className="btn discussion-btn"
          onClick={() => setOpened(false)}>
          <X />
        </button>
      </div>
    );
  }
  return (
    <div className="dicussion-component">
      <button
        className="btn discussion-btn"
        onClick={() => setOpened(true)}
      >
        <MessageCircle />
      </button>
    </div>
  );
};

const mapStateToProps = (state) => ({
  ...state.context,
});

export const Discussion = connect(mapStateToProps)(DiscussionComponent);