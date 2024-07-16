import Axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";

/** Types */
import {
    Twitter,
    VideoVariants,
    Author,
    Statistics,
    Media,
} from "../types/twitter";
import { Config } from "../types/config";

/** Functions */
import { getGuestToken } from "./getGuestToken";
import { getTwitterAuthorization } from "./getAuthorization";
import { features, variables } from "../contants/params";
import {
    _tweetresultbyrestid,
    _twitterPostID,
    _twitterapi,
} from "../contants/api";

const millsToMinutesAndSeconds = (millis: number) => {
    const minutes = Math.floor(millis / 60000);
    const seconds = ((millis % 60000) / 1000).toFixed(0);
    return `${minutes}:${Number(seconds) < 10 ? "0" : ""}${seconds}`;
};

export const TwitterDL = (
    url: string,
    config?: Config,
    proxy?: string
): Promise<Twitter> =>
    new Promise(async (resolve) => {
        const id = url.match(/\/([\d]+)/);
        const regex = /^(https?:\/\/)?(www\.)?(m\.)?twitter|x\.com\/\w+/;

        /** Validate */
        if (!regex.test(url))
            return resolve({ status: "error", message: "Invalid URL!" });
        if (!id)
            return resolve({
                status: "error",
                message:
                    "There was an error getting twitter id. Make sure your twitter url is correct!",
            });

        const guest_token = await getGuestToken();
        const csrf_token = config?.cookie
            ? config.cookie.match(/(?:^|; )ct0=([^;]*)/)
            : "";

        if (!guest_token)
            return resolve({
                status: "error",
                message: "Failed to get Guest Token. Authorization is invalid!",
            });

        /** Get Data */
        Axios(_twitterapi(_twitterPostID, _tweetresultbyrestid), {
            method: "GET",
            params: {
                variables: JSON.stringify(variables(id[1])),
                features: JSON.stringify(features),
            },
            headers: {
                Authorization: config?.authorization
                    ? config.authorization
                    : await getTwitterAuthorization(),
                Cookie: config?.cookie ? config.cookie : "",
                "x-csrf-token": csrf_token ? csrf_token[1] : "",
                "x-guest-token": guest_token,
                "user-agent":
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.132 Safari/537.36",
            },
            httpsAgent:
                (proxy &&
                    (proxy.startsWith("socks")
                        ? new SocksProxyAgent(proxy)
                        : proxy.startsWith("http")
                        ? new HttpsProxyAgent(proxy)
                        : undefined)) ||
                undefined,
        })
            .then(({ data }) => {
                if (!data.data.tweetResult?.result) {
                    return resolve({
                        status: "error",
                        message: "Tweet not found!",
                    });
                }
                if (data.data.tweetResult.result?.reason === "NsfwLoggedOut") {
                    /** Use Cookies to avoid errors */
                    return resolve({
                        status: "error",
                        message:
                            "This tweet contains sensitive content! Please use cookies to avoid errors!",
                    });
                }
                const result =
                    data.data.tweetResult.result.__typename ===
                    "TweetWithVisibilityResults"
                        ? data.data.tweetResult.result.tweet
                        : data.data.tweetResult.result;
                const statistics: Statistics = {
                    replieCount: result.legacy.reply_count,
                    retweetCount: result.legacy.retweet_count,
                    favoriteCount: result.legacy.favorite_count,
                    bookmarkCount: result.legacy.bookmark_count,
                    viewCount: Number(result.views.count),
                };
                const user = result.core.user_results.result;
                const author: Author = {
                    username: user.legacy.screen_name,
                    bio: user.legacy.description,
                    possiblySensitive: user.legacy.possibly_sensitive,
                    verified: user.legacy.verified,
                    location: user.legacy.location,
                    profileBannerUrl: user.legacy.profile_banner_url,
                    profileImageUrl: user.legacy.profile_image_url_https,
                    url: "https://twitter.com/" + user.legacy.screen_name,
                    statistics: {
                        favoriteCount: user.legacy.favourites_count,
                        followersCount: user.legacy.followers_count,
                        friendsCount: user.legacy.friends_count,
                        statusesCount: user.legacy.statuses_count,
                        listedCount: user.legacy.listed_count,
                        mediaCount: user.legacy.media_count,
                    },
                };
                /** If there is no media, the Array will be empty */
                const media: Media[] =
                    result.legacy?.entities?.media?.map((v: any) => {
                        if (v.type === "photo") {
                            return {
                                type: v.type,
                                image: v.media_url_https,
                                expandedUrl: v.expanded_url,
                            };
                        } else {
                            const isGif = v.type === "animated_gif";
                            const videos: VideoVariants[] =
                                v.video_info.variants
                                    .filter(
                                        (video: any) =>
                                            video.content_type === "video/mp4"
                                    )
                                    .map((variants: any) => {
                                        let quality = isGif
                                            ? `${v.original_info.width}x${v.original_info.height}`
                                            : variants.url.match(
                                                  /\/([\d]+x[\d]+)\//
                                              )[1];
                                        return {
                                            bitrate: variants.bitrate,
                                            content_type: variants.content_type,
                                            quality,
                                            url: variants.url,
                                        };
                                    });
                            return {
                                type: v.type,
                                cover: v.media_url_https,
                                duration: millsToMinutesAndSeconds(
                                    v.video_info.duration_millis
                                ),
                                expandedUrl: v.expanded_url,
                                videos,
                            };
                        }
                    }) || [];
                resolve({
                    status: "success",
                    result: {
                        id: result.legacy.id_str,
                        createdAt: result.legacy.created_at,
                        description: result.legacy.full_text,
                        languange: result.legacy.lang,
                        possiblySensitive:
                            result.legacy.possibly_sensitive || false,
                        possiblySensitiveEditable:
                            result.legacy.possibly_sensitive_editable || false,
                        isQuoteStatus: result.legacy.is_quote_status,
                        mediaCount: media.length,
                        author,
                        statistics,
                        media,
                    },
                });
            })
            .catch((e) => {
                return resolve({
                    status: "error",
                    message: e.message,
                });
            });
    });
