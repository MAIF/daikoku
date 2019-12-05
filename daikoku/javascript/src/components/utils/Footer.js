import React, {useState, useEffect} from 'react';
import { connect } from "react-redux";
import classNames from 'classnames';

import { udpateLanguage } from "../../core";
import { languages } from "../../locales";

const FooterComponent = ({ currentLanguage, updateContextLanguage}) => {
  const [language, setLanguage] = useState(currentLanguage)

  useEffect(() => {
    if (language != currentLanguage) {
      updateContextLanguage(language)
    }
  }, [language])
 
  return (
    <footer className="footer mt-auto py-3  text-muted" style={{
        'bottom': '0',
        'width': '100 %',
        'position': 'fixed',
        'height': '60px',
        'backgroundColor': '#f5f5f5'
    }}>
      <div className="container">
        <ul className="languages-footer-links">
          {
            languages.map(({label, value}, idx) => {
              return (
                <li 
                  key={idx} 
                  className={classNames("language-footer", {active: value === language})} 
                  onClick={() => setLanguage(value)}>{label}</li>
              )
            })
          }
        </ul>
      </div>
    </footer>
  )
}

const mapStateToProps = state => ({
  ...state.context,
});

const mapDispatchToProps = {
  updateContextLanguage: l => udpateLanguage(l)
};

export const Footer = connect(mapStateToProps, mapDispatchToProps)(FooterComponent)