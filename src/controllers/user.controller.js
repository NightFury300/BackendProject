import { asyncHandler } from "../utils/asyncHandler.js";
import { APIError } from "../utils/APIError.js";
import { APIResponse } from "../utils/APIRespone.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/CloudinaryUpload.js";
import jwt from "jsonwebtoken"
import mongoose from "mongoose";

const generateAccessAndRefreshToken = async (userId) => {
    try{
        const user = await User.findById(userId);
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();
        user.refreshToken = refreshToken;
        await user.save({validateBeforeSave: false})

        return {accessToken,refreshToken}
    }catch(error){
        throw new APIError(500,"Something went wrong while generating access and refresh token")
    }
}

const registerUser = asyncHandler(async (req,res) => {
    const {username,email,fullName,password} = req.body;

    if([username,email,fullName,password].some((field) => field?.trim() == ""))
        throw new APIError(400,"All fields are required.");

    const existedUser = await User.findOne({$or: [{username},{email}
    ]})
    if(existedUser)
        throw new APIError(408,"User with that username or email already exists");

    const avatarLocalPath = req.files?.avatar[0]?.path;

    let coverImageLocalPath;
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0)
        coverImageLocalPath = req.files.coverImage[0].path;

    if(!avatarLocalPath)
        throw new APIError(400,"Avatar file is required")

    const avatar = await uploadOnCloudinary(avatarLocalPath);
    const coverImage = await uploadOnCloudinary(coverImageLocalPath);

    if(!avatar)
        throw new APIError(400,"Avatar file is required");

    const user = await User.create({
        username: username.toLowerCase(),
        email,
        fullName,
        password,
        avatar: avatar.url,
        coverImage: coverImage?.url || ""
    })

    const createdUser = await User.findById(user._id).select("-password -refreshToken")

    if(!createdUser)
        throw new APIError(500,"Something went wrong while registering the user")

    return res.status(201).json(new APIResponse(200,createdUser,"User registered Successfully"))
})

const loginUser = asyncHandler(async (req,res) => {
    const {email,username,password} = req.body;

    if(!(username||email))
        throw new APIError(400,"Username or email is required.")

    const user = await User.findOne({$or: [{username},{email}]})

    if(!user)
        throw new APIError(404,"User not found");

    const isValidPassword = await user.isCorrectPassword(password);

    if(!isValidPassword)
        throw new APIError(401,"Invalid User Password")

    const {accessToken,refreshToken} = await generateAccessAndRefreshToken(user._id);

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken");

    const options = {
        httpOnly: true,
        secure: true
    }

    res.
    status(200).
    cookie("accessToken",accessToken,options).
    cookie("refreshToken",refreshToken,options).
    json(new APIResponse(200,
        {
        user: loggedInUser,
        accessToken,
        refreshToken
        },
        "User Logged in Successfully"
        )
    )
})

const logoutUser = asyncHandler(async (req,res) => {
    const user = await User.findById(req.user._id)
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $unset: {
                refreshToken: 1 // this removes the field from document
            }
        },
        {
        new: true
        }
    )

    const options = {
        httpOnly: true,
        secure: true
    }

    res.
    status(200).
    clearCookie("accessToken",options).
    clearCookie("refreshToken",options).
    json(
        new APIResponse(200,{},"Logged Out Successfully")
    )
})

const refreshAccessToken = asyncHandler(async (req,res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

    if(!incomingRefreshToken)
        throw new APIError(401,"Invalid Authorization")

    try {
        const decodedToken = jwt.verify(incomingRefreshToken,process.env.REFRESH_TOKEN_SECRET)
    
        const user = await User.findById(decodedToken?._id);
    
        if(!user)
            throw new APIError(401,"Invalid Access Token")
    
        if(user?.refreshToken !== incomingRefreshToken)
            throw new APIError(401,"Refresh Token is expired or used")
    
        const {accessToken,refreshToken: newRefreshToken} = await generateAccessAndRefreshToken(user._id)
        const options = {
            httpOnly: true,
            secure: true
        }
        res.
        status(200).
        cookie("accessToken",accessToken,options).
        cookie("refreshToken",newRefreshToken,options).
        json(
            new APIResponse(200,{accessToken,refreshToken:newRefreshToken},"Access Token Refreshed Successfully")
        )
    } catch (error) {
        throw new APIError(401,error?.message || "Invalid Refresh Token")
    }
})

const changeCurrentPassword = asyncHandler(async (req,res) => {
    const {oldPassword,newPassword} = req.body;

    const user = await User.findById(req.user?._id);
    const isCorrectPassword = await user.isCorrectPassword(oldPassword);

    if(!isCorrectPassword)
        throw new APIError(400,"Invalid Old Password")

    user.password = newPassword
    await user.save({validateBeforeSave: false})

    return res.
            status(200).
            json(new APIResponse(200,{},"Password updated Successfully"))
})

const getCurrentUser = asyncHandler(async (req,res) => {
    return res.
            status(200).
            json(new APIResponse(200,req.user,"User fetched successfully"))
})

const updateUserDetails = asyncHandler(async (req,res) => {
    const {fullName,email} = req.body;

    if(!fullName || !email)
        throw new APIError(400,"All fields are required")

    const user = User.findByIdAndUpdate(req.user._id,
        {
        $set:{
        fullName,
        email
            }
        },
    {new: true}
    ).select("-password")

    return res.
            status(200).
            json(new APIResponse(200,user,"Details updated Successfully"))
})

const updateUserAvatar = asyncHandler(async (req,res) => {
    const localAvatarPath = req.file;
    if(!localAvatarPath)
        throw new APIError(404,"Invalid Avatar Path")

    const avatar = await uploadOnCloudinary(localAvatarPath)

    if(!avatar.url)
        throw new APIError(400,"Error while uploading")

    const user = User.findByIdAndUpdate(req.user._id,
        {
            $set: {
            avatar: avatar.url
            }
        },
        {new: true}
    ).select("-password")

    return res.
            status(200).
            json(new APIResponse(200,user,"Avatar changed Successfully"))
})

const updateUserCover = asyncHandler(async (req,res) => {
    const localCoverPath = req.file;
    if(!localCoverPath)
        throw new APIError(404,"Invalid Cover Path")

    const cover = await uploadOnCloudinary(localCoverPath)

    if(!cover.url)
        throw new APIError(400,"Error while uploading")

    const user = User.findByIdAndUpdate(req.user._id,
        {
            $set: {
            coverImage: cover.url
            }
        },
        {new: true}
    ).select("-password")

    return res.
            status(200).
            json(new APIResponse(200,user,"Avatar changed Successfully"))
})

const getChannelInfo = asyncHandler(async (req,res) => {
    const username = req.params;
    
    if(!username)
        throw new APIError(404,"Username is missing")

    const channel = await User.aggregate(
        {
            $match: {
                username: username?.toLowerCase()
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "$channel",
                as: "subscribers"
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "$subscriber",
                as: "subscribed"
            }
        },
        {
            $addFields: {
                subscribers: {
                    $size: "subscribers"
                },
                subscribed: {
                    $size: "subscribed"
                },
                isSubscribed: {
                    $cond: {
                        $if: {$in: [req.user._id,"$subscribers.subscriber"]},
                        $then: true,
                        $else: false
                    }
                }
            }
        },
        {
            $project:{
                fullName: 1,
                userName: 1,
                subscriber: 1,
                subscribed: 1,
                avatar: 1,
                coverImage: 1,
                isSubscribed: 1
            }
        }
    )

    if(!channel.length > 0)
        throw new APIError(404,"Channel does not exists")

    return res.
            status(200).
            json(new APIResponse(200,channel[0],"User fetched successfully"))
})

const getWatchHistory = asyncHandler(async (req,res) => {
    const user = await User.aggregate(
        {
            $match: {
                _id: new mongoose.Types.ObjectId(req.user._id)
            }
        },
        {
            $lookup: {
                from: "videos",
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchHistory",
                pipeline: 
                [
                    {
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            pipeline: [
                                {
                                    $project:{
                                        fullName: 1,
                                        username: 1,
                                        avatar: 1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields:{
                            owner:{
                                $first: "$owner"
                            }
                        }
                    }
                ]
            }
        }
    );

    return res.
    status(200).
    json(new APIResponse(200,user[0].watchHistory,"Watch History Fetched Successfully"))
})
export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateUserDetails,
    updateUserAvatar,
    updateUserCover,
    getChannelInfo,
    getWatchHistory
};