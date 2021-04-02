import React, { Suspense } from "react";
import { toastr } from "react-redux-toastr";
import { Spinner } from "../..";
import { t } from "../../../locales";
import * as Services from '../../../services/index';

const LazySingleMarkdownInput = React.lazy(() => import('../../inputs/SingleMarkdownInput'));
const LazyForm = React.lazy(() => import('../../../components/inputs/Form'));

export class TeamApiPost extends React.Component {

    state = {
        selected: null,
        newPostOpen: false,
        posts: [],
        pagination: {
            limit: 1,
            offset: 0,
            total: 0
        }
    }

    flow = [
        'title',
        'content'
    ];

    schema = {
        title: { type: 'string', props: { label: t('Page title', this.props.currentLanguage) } },
        content: {
            type: 'markdown',
            props: {
                currentLanguage: this.props.currentLanguage,
                label: 'Page content',
                height: '320px',
                team: this.props.team
            },
        }
    };

    componentDidMount() {
        this.loadPosts();
    }

    loadPosts = (offset = 0, limit = 1) => {
        Services.getAPIPosts(this.props.api._id, offset, limit)
            .then(data => {
                this.setState({
                    posts: [
                        ...this.state.posts,
                        ...data.posts.map(p => ({
                            ...p,
                            isOpen: false
                        }))
                    ],
                    newPostOpen: data.posts.length === 0,
                    pagination: {
                        ...this.state.pagination,
                        total: data.total
                    }
                })
            })
    }

    loadOldPosts = () => {
        const { posts, pagination } = this.state;
        this.loadPosts(posts.length < 10 ? 0 : (pagination.offset + 1), 10)
    }

    handleContent = (i, code) => {
        this.setState({
            posts: this.state.posts.map((post, j) => {
                if (j === i)
                    post.content = code
                return post;
            })
        });
    }

    toggleNewPost = () => {
        this.setState({ newPostOpen: !this.state.newPostOpen })
    }

    togglePost = i => {
        this.setState({
            posts: this.state.posts.map((post, j) => {
                if (j === i)
                    post.isOpen = !post.isOpen;
                return post;
            })
        });
    }

    savePost = i => {
        Services.savePost(this.props.api._id, this.props.team._id, this.state.posts.find((_, j) => j === i))
            .then(res => {
                if (res.status === 200)
                    toastr.success(t('Post saved'))
                else
                    toastr.error(t('Something went wrong'))
            });
    }

    publishPost = () => {
        Services.publishNewPost(this.props.api._id, this.props.team._id, {
            ...this.state.selected,
            "_id": ""
        })
            .then(res => {
                if (res.status === 200)
                    toastr.success(t('Post saved'))
                else
                    toastr.error(t('Something went wrong'))
            })
    }

    render() {
        const { posts, selected, newPostOpen, pagination } = this.state;
        const { team, currentLanguage } = this.props
        return (
            <div>
                <div className="">
                    {newPostOpen ? <>
                        <React.Suspense fallback={<Spinner />}>
                            <LazyForm
                                flow={this.flow}
                                schema={this.schema}
                                value={selected}
                                onChange={(selected) => this.setState({ selected })}
                            />
                        </React.Suspense>
                        <div className="m-3">
                            <button className="btn btn-outline-success mr-1" onClick={this.publishPost}>{t('Publish post', currentLanguage)}</button>
                            <button className="btn btn-outline-danger" onClick={this.toggleNewPost}>{t('Cancel', currentLanguage)}</button>
                        </div>
                    </> :
                        <button className="btn btn-outline-info" onClick={this.toggleNewPost}>{t('New Post', currentLanguage)}</button>}
                </div>
                {!newPostOpen && <div>
                    <h2>{t('Posts', currentLanguage)}</h2>
                    <div>
                        {posts.length === 0 && <p>{t('Any posts', currentLanguage)}</p>}
                        {posts.map((post, i) => (
                            <div key={i}>
                                <div className="d-flex justify-content-between align-items-center">
                                    <p>{post.title}</p>
                                    <button className="btn btn-outline-info" onClick={() => this.togglePost(i)}>
                                        <i className={`fas fa-chevron-${post.isOpen ? "up" : "down"}`} />
                                    </button>
                                </div>
                                {post.isOpen && <>
                                    <React.Suspense fallback={<div>loading ...</div>}>
                                        <LazySingleMarkdownInput
                                            currentLanguage={this.props.currentLanguage}
                                            team={team}
                                            height={window.innerHeight - 300 + 'px'}
                                            value={post.content}
                                            onChange={code => this.handleContent(i, code)}
                                        />
                                    </React.Suspense>
                                    <button className="btn btn-outline-success m-3" onClick={() => this.savePost(i)}>
                                        {t('Save post', currentLanguage)}
                                    </button>
                                </>
                                }
                            </div>
                        ))}
                    </div>
                    {
                        posts.length < pagination.total &&
                        <button className="btn btn-outline-info" onClick={this.loadOldPosts}>
                            {t('Load old posts', currentLanguage)}
                        </button>
                    }
                </div>}
            </div>
        );
    }
}