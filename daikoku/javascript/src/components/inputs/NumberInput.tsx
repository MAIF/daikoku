import React, { Component } from 'react';
import { Help } from './Help';

export class NumberInput extends Component {
  onChange = (e: any) => {
    if (e && e.preventDefault) e.preventDefault();
    const value = e.target.value;
    if (value.indexOf('.') > -1) {
      (this.props as any).onChange(parseFloat(value));
    } else {
      (this.props as any).onChange(parseInt(value, 10));
    }
  };

  render() {
        return (<div className="mb-3 row">
                <label htmlFor={`input-${(this.props as any).label}`} className="col-xs-12 col-sm-2 col-form-label">
                    <Help text={(this.props as any).help} label={(this.props as any).label}/>
        </label>
                <div className="col-sm-10">
                    {((this.props as any).prefix || (this.props as any).suffix) && (<div className="input-group">
                            {(this.props as any).prefix && (<div className="input-group-text">
                                    <span className="input-group-text">{(this.props as any).prefix}</span>
                </div>)}
                            <input type="number" step={(this.props as any).step} min={(this.props as any).min} max={(this.props as any).max} disabled={(this.props as any).disabled} className="form-control" id={`input-${(this.props as any).label}`} placeholder={(this.props as any).placeholder} value={(this.props as any).value} onChange={this.onChange}/>
                            {(this.props as any).suffix && (<div className="input-group-append">
                                    <span className="input-group-text">{(this.props as any).suffix}</span>
                </div>)}
            </div>)}
                    {!((this.props as any).prefix || (this.props as any).suffix) && (<input type="number" step={(this.props as any).step} min={(this.props as any).min} max={(this.props as any).max} disabled={(this.props as any).disabled} className="form-control" id={`input-${(this.props as any).label}`} placeholder={(this.props as any).placeholder} value={(this.props as any).value} onChange={this.onChange}/>)}
        </div>
      </div>);
  }
}

export class VerticalNumberInput extends Component {
  onChange = (e: any) => {
    if (e && e.preventDefault) e.preventDefault();
    const value = e.target.value;
    if (value.indexOf('.') > -1) {
      (this.props as any).onChange(parseFloat(value));
    } else {
      (this.props as any).onChange(parseInt(value, 10));
    }
  };

  render() {
        return (<div className="mb-3 row">
                <div className="col-xs-12">
                    <label htmlFor={`input-${(this.props as any).label}`} className="col-form-label">
                        <Help text={(this.props as any).help} label={(this.props as any).label}/>
          </label>
                    <div>
                        {((this.props as any).prefix || (this.props as any).suffix) && (<div className="input-group">
                                {(this.props as any).prefix && <div className="input-group-addon">{(this.props as any).prefix}</div>}
                                <input type="number" step={(this.props as any).step} min={(this.props as any).min} max={(this.props as any).max} disabled={(this.props as any).disabled} className="form-control" id={`input-${(this.props as any).label}`} placeholder={(this.props as any).placeholder} value={(this.props as any).value} onChange={this.onChange}/>
                                {(this.props as any).suffix && <div className="input-group-addon">{(this.props as any).suffix}</div>}
              </div>)}
                        {!((this.props as any).prefix || (this.props as any).suffix) && (<input type="number" step={(this.props as any).step} min={(this.props as any).min} max={(this.props as any).max} disabled={(this.props as any).disabled} className="form-control" id={`input-${(this.props as any).label}`} placeholder={(this.props as any).placeholder} value={(this.props as any).value} onChange={this.onChange}/>)}
          </div>
        </div>
      </div>);
  }
}

export class NumberRangeInput extends Component {
  onChangeFrom = (e: any) => {
    if (e && e.preventDefault) e.preventDefault();
    const value = e.target.value;
    if (value.indexOf('.') > -1) {
      (this.props as any).onChangeFrom(parseFloat(value));
    } else {
      (this.props as any).onChangeFrom(parseInt(value, 10));
    }
  };

  onChangeTo = (e: any) => {
    if (e && e.preventDefault) e.preventDefault();
    const value = e.target.value;
    if (value.indexOf('.') > -1) {
      (this.props as any).onChangeTo(parseFloat(value));
    } else {
      (this.props as any).onChangeTo(parseInt(value, 10));
    }
  };

  render() {
        return (<div className="mb-3 row">
                <label htmlFor={`input-${(this.props as any).label}`} className="col-xs-12 col-sm-2 col-form-label">
                    <Help text={(this.props as any).help} label={(this.props as any).label}/>
        </label>
                <div className="col-sm-10">
                    {((this.props as any).prefixFrom || (this.props as any).suffixFrom) && (<div className="input-group col-sm-6" style={{ float: 'inherit' }}>
                            {(this.props as any).prefixFrom && (<div className="input-group-addon">{(this.props as any).prefixFrom}</div>)}
                            <input type="number" step={(this.props as any).stepFrom} min={(this.props as any).minFrom} max={(this.props as any).maxFrom} disabled={(this.props as any).disabled} className="form-control" id={`input-${(this.props as any).labelFrom}`} placeholder={(this.props as any).placeholderFrom} value={(this.props as any).valueFrom} onChange={this.onChangeFrom}/>
                            {(this.props as any).suffixFrom && (<div className="input-group-addon">{(this.props as any).suffixFrom}</div>)}
            </div>)}
                    {((this.props as any).prefixTo || (this.props as any).suffixTo) && (<div className="input-group col-sm-6" style={{ float: 'inherit' }}>
                            {(this.props as any).prefixTo && (<div className="input-group-addon">{(this.props as any).prefixTo}</div>)}
                            <input type="number" step={(this.props as any).stepTo} min={(this.props as any).minTo} max={(this.props as any).maxTo} disabled={(this.props as any).disabled} className="form-control" id={`input-${(this.props as any).labelTo}`} placeholder={(this.props as any).placeholderTo} value={(this.props as any).valueTo} onChange={this.onChangeTo}/>
                            {(this.props as any).suffixTo && (<div className="input-group-addon">{(this.props as any).suffixTo}</div>)}
            </div>)}
                    {!((this.props as any).prefixFrom || (this.props as any).suffixFrom) && (<input type="number" step={(this.props as any).stepFrom} min={(this.props as any).minFrom} max={(this.props as any).maxFrom} disabled={(this.props as any).disabledFrom} className="form-control" id={`input-${(this.props as any).labelFrom}`} placeholder={(this.props as any).placeholderFrom} value={(this.props as any).valueFrom} onChange={this.onChangeFrom}/>)}
                    {!((this.props as any).prefixTo || (this.props as any).suffixTo) && (<input type="number" step={(this.props as any).stepTo} min={(this.props as any).minTo} max={(this.props as any).maxTo} disabled={(this.props as any).disabledTo} className="form-control" id={`input-${(this.props as any).labelTo}`} placeholder={(this.props as any).placeholderTo} value={(this.props as any).valueTo} onChange={this.onChangeTo}/>)}
        </div>
      </div>);
  }
}
