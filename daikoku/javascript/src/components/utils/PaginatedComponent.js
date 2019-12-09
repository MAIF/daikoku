import React, { Component } from 'react';
import PropTypes from 'prop-types';
import Pagination from 'react-paginate';
import classNames from 'classnames';
import { t } from '../../locales';

export class PaginatedComponent extends Component {
  state = {
    selectedPage: 0,
    offset: 0,
    pageNumber: this.props.count || 10,
    itemsCount: this.props.items.length,
  };

  static getDerivedStateFromProps(props, state) {
    if (state.itemsCount !== props.items.length) {
      return { selectedPage: 0, offset: 0 };
    } else {
      return null;
    }
  }

  handlePageClick = data => {
    this.setState({ offset: data.selected * this.state.pageNumber, selectedPage: data.selected });
  };

  render() {
    const pagedItems = this.props.items.slice(
      this.state.offset,
      this.state.offset + this.state.pageNumber
    );

    return (
      <div className="paginated-component">
        <div className="row flex-column">
          <div
            className={classNames('row d-flex', {
              'flex-wrap': this.props.wrap,
              'flex-column': this.props.columnMode,
              'flex-column-reverse': this.props.columnMode && this.props.reverse,
              'flex-row': !this.props.columnMode,
              'flex-row-reverse': !this.props.columnMode && this.props.reverse,
            })}>
            {pagedItems.map(item => {
              if (React.isValidElement(item)) {
                return item;
              }

              return this.props.formatter(item);
            })}
          </div>
          <div className="apis__pagination d-flex justify-content-center" style={{ width: '100%' }}>
            <Pagination
              previousLabel={this.props.previousLabel || t('Previous', this.props.currentLanguage)}
              nextLabel={this.props.nextLabel || t('Next', this.props.currentLanguage)}
              breakLabel={this.props.breakLabel || '...'}
              breakClassName={'break'}
              pageCount={Math.ceil(this.props.items.length / this.state.pageNumber)}
              marginPagesDisplayed={1}
              pageRangeDisplayed={5}
              onPageChange={this.handlePageClick}
              containerClassName={'pagination'}
              pageClassName={'page-selector'}
              forcePage={this.state.selectedPage}
              activeClassName={'active'}
            />
          </div>
        </div>
      </div>
    );
  }
}

PaginatedComponent.propTypes = {
  items: PropTypes.array.isRequired,
  formatter: PropTypes.func.isRequired,
  count: PropTypes.number,
  columnMode: PropTypes.bool,
  reverse: PropTypes.bool,
  previousLabel: PropTypes.string,
  nextLabel: PropTypes.string,
  breakLabel: PropTypes.string,
  currentLanguage: PropTypes.string,
};
