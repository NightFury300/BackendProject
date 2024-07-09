import { asyncHandler } from "../utils/asyncHandler.js";
import { APIError } from "../utils/APIError.js";
import { APIResponse } from "../utils/APIRespone.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/CloudinaryUpload.js";
import jwt from "jsonwebtoken"

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
export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken
};