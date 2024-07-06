const asyncHandler = (handlerRequest) => {
    return (req,res,next) => {
    Promise.resolve(handlerRequest(req,res,next)).catch((err) => next(err))
    }
}

export {asyncHandler}