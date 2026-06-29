import React from 'react';
import {Share} from "lucide-react";

export const LinkDisplay = (props: any) => <div className="mb-3 row">
    <label className="col-sm-2 control-label mb-2" />
    <div className="col-sm-10">
        <Share />{' '}{' '}
        <a href={props.link} target="_blank" rel="noopener noreferrer">
      {props.link}
    </a>
  </div>
</div>;
