import { User } from "../models/user.model.js";
import { APIError } from "../utils/APIError.js";
import jwt from "jsonwebtoken"
import { asyncHandler } from "../utils/asyncHandler.js";

export const verifyJWTToken = asyncHandler(async (req,_,next) => {
    try {
        const accessToken = req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer ","");
    
        if(!accessToken)
            throw new APIError(401,"Invalid Authorization")
    
        const decodedToken = jwt.verify(accessToken,process.env.ACCESS_TOKEN_SECRET);
    
        const user = await User.findById(decodedToken._id).select("-password -refreshToken");
    
        if(!user)
            throw new APIError(401,"Invalid Access Token");
    
        req.user = user
        next()
    } catch (error) {
        throw new APIError(401, error?.message || "Invalid access token")
    }
})