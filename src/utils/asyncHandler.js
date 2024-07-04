const asyncHandler = (handlerRequest) => {
    (req,res,next) => {
    Promise.resolve(handlerRequest(req,res,next)).catch((err) => next(err))
    }
}

export {asyncHandler}