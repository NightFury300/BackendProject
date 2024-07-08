import { asyncHandler } from "../utils/asyncHandler.js";
import { APIError } from "../utils/APIError.js";
import { APIResponse } from "../utils/APIRespone.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/CloudinaryUpload.js";

const registerUser = asyncHandler(async (req,res) => {
    const {username,email,fullName,password} = req.body;

    if([username,email,fullName,password].some((field) => field?.trim() == ""))
        throw new APIError(400,"All fields are required.");

    const existedUser = User.findOne({$or: [{username},{email}
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

    return res.send(201).json(new APIResponse(200,createdUser,"User registered Successfully"))
})

export {registerUser};